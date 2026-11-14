"""Real MongoDB integration tests for workflow transaction primitives.

Run separately with:
    python -m pytest --ds=config.mongodb_test_settings tests/test_mongodb_workflow_transactions.py

The settings module is loopback-only and targets a dedicated disposable test
database on the isolated replica set. These tests never connect to production.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
import time

import pytest
from django.db import connections
from django.db.models import F

from apps.core.db_transactions import MongoNestedAtomicError, transaction
from apps.core.models import WorkflowMutex
from apps.core.workflow_concurrency import (
    item_scope,
    retry_transient_mongo_transaction,
    workflow_scope,
    workflow_transaction,
)

requires_mongodb = pytest.mark.skipif(
    connections['default'].vendor != 'mongodb',
    reason='Requires the dedicated MongoDB replica-set test settings.',
)


def test_workflow_scope_normalizes_uuid_identifiers():
    identifier = 'AA7CF37C-4F70-4B6E-BECD-8F2CDAD13537'
    assert item_scope(identifier) == item_scope(identifier.lower())
    assert workflow_scope('user', identifier) == 'user:aa7cf37c-4f70-4b6e-becd-8f2cdad13537'


@requires_mongodb
@pytest.mark.django_db(transaction=True)
def test_workflow_transaction_commits_mutex_and_commit_callbacks():
    callback_results = []

    with workflow_transaction('test:commit-callback'):
        WorkflowMutex.objects.filter(pk='test:commit-callback').update(revision=F('revision') + 1)
        transaction.on_commit(lambda: callback_results.append('committed'))

    row = WorkflowMutex.objects.get(pk='test:commit-callback')
    assert row.revision == 2
    assert callback_results == ['committed']


@requires_mongodb
@pytest.mark.django_db(transaction=True)
def test_workflow_transaction_rolls_back_revision_and_commit_callback():
    callback_results = []
    with pytest.raises(ValueError):
        with workflow_transaction('test:rollback'):
            WorkflowMutex.objects.filter(pk='test:rollback').update(revision=F('revision') + 9)
            transaction.on_commit(lambda: callback_results.append('must-not-run'))
            raise ValueError('rollback probe')

    row = WorkflowMutex.objects.get(pk='test:rollback')
    assert row.revision == 0
    assert callback_results == []


@requires_mongodb
@pytest.mark.django_db(transaction=True)
def test_explicit_rollback_aborts_transaction_without_raising():
    callback_results = []

    with workflow_transaction('test:explicit-rollback'):
        WorkflowMutex.objects.filter(pk='test:explicit-rollback').update(
            revision=F('revision') + 5
        )
        transaction.on_commit(lambda: callback_results.append('must-not-run'))
        transaction.set_rollback(True)

    assert WorkflowMutex.objects.get(pk='test:explicit-rollback').revision == 0
    assert callback_results == []


@requires_mongodb
@pytest.mark.django_db(transaction=True)
def test_caught_nested_failure_aborts_the_outer_mongo_transaction():
    WorkflowMutex.objects.create(scope='test:nested-failure')

    with pytest.raises(MongoNestedAtomicError):
        with transaction.atomic():
            WorkflowMutex.objects.filter(pk='test:nested-failure').update(revision=F('revision') + 4)
            try:
                with transaction.atomic():
                    raise ValueError('inner failure')
            except ValueError:
                pass
            WorkflowMutex.objects.filter(pk='test:nested-failure').update(revision=F('revision') + 1)

    assert WorkflowMutex.objects.get(pk='test:nested-failure').revision == 0


@requires_mongodb
@pytest.mark.django_db(transaction=True)
def test_parallel_transactions_serialize_through_real_mongo_mutex():
    start_together = Barrier(2)
    attempt_lock = Lock()
    attempt_counts = {0: 0, 1: 0}

    def worker(worker_id):
        start_together.wait(timeout=10)

        @retry_transient_mongo_transaction(max_attempts=12)
        def operation():
            with attempt_lock:
                attempt_counts[worker_id] += 1
                attempt_number = attempt_counts[worker_id]
            scopes = (
                ('test:parallel', 'test:shared')
                if worker_id == 0
                else ('test:shared', 'test:parallel')
            )
            with workflow_transaction(*scopes):
                # Keep the first attempts overlapping long enough for MongoDB
                # to surface a genuine transaction write conflict.
                if attempt_number == 1:
                    time.sleep(0.15)
                return WorkflowMutex.objects.get(pk='test:parallel').revision

        try:
            return operation()
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(worker, (0, 1)))

    assert len(outcomes) == 2
    assert WorkflowMutex.objects.get(pk='test:parallel').revision == 2
    assert WorkflowMutex.objects.get(pk='test:shared').revision == 2
    assert max(attempt_counts.values()) > 1
