"""Mongo-safe coordination for high-risk multi-document state transitions."""

from contextlib import contextmanager
from functools import wraps
import random
import time
import uuid

from django.db import DEFAULT_DB_ALIAS, IntegrityError, connections
from django.db.models import F
from django.utils import timezone

from apps.core.db_transactions import transaction
from apps.core.models import WorkflowMutex


SYSTEM_ADMIN_SCOPE = 'admin:system-administrators'
# A single gate is intentionally used for physical custody mutations. Locker
# allocation, movement, and release all touch shared occupancy records; a
# common scope avoids stale lock-set races when the current locker changes
# between an initial read and transaction entry.
CUSTODY_INVENTORY_SCOPE = 'custody:inventory'
MAX_TRANSIENT_TRANSACTION_RETRIES = 8


def workflow_scope(kind, identifier):
    """Build a stable, non-sensitive aggregate scope key."""
    value = str(identifier).strip()
    try:
        value = str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        pass
    return f'{kind}:{value}'


def item_scope(item_id):
    return workflow_scope('item', item_id)


def locker_scope(locker_id):
    return workflow_scope('locker', locker_id)


def custody_location_scope(location_id):
    return workflow_scope('custody-location', location_id)


def user_scope(user_id):
    return workflow_scope('user', user_id)


def _ensure_scope_rows(scopes, using):
    manager = WorkflowMutex.objects.using(using)
    for scope in scopes:
        if manager.filter(pk=scope).exists():
            continue
        try:
            manager.create(scope=scope)
        except IntegrityError:
            # A concurrent request may have inserted the same coordination
            # document. The primary key makes that race safe; confirm it exists.
            if not manager.filter(pk=scope).exists():
                raise


def _increment_scope(scope, using):
    connection = connections[using]
    manager = WorkflowMutex.objects.using(using)
    if connection.vendor == 'mongodb':
        if not getattr(connection, 'in_atomic_block_mongo', False):
            raise RuntimeError('MongoDB workflow mutex updates require an active Mongo transaction.')
        changed = manager.filter(pk=scope).update(
            revision=F('revision') + 1,
            updated_at=timezone.now(),
        )
        if changed != 1:
            raise RuntimeError(f'Workflow coordination record is missing for scope {scope!r}.')
        return

    manager.select_for_update().get(pk=scope)
    changed = manager.filter(pk=scope).update(
        revision=F('revision') + 1,
        updated_at=timezone.now(),
    )
    if changed != 1:
        raise RuntimeError(f'Workflow coordination record is missing for scope {scope!r}.')


@contextmanager
def workflow_transaction(*scopes, using=None):
    """Run a transaction while atomically updating every shared workflow gate.

    All callers that can change the same aggregate must request the same scope.
    Scope creation happens before the transaction and has no business effect;
    the revision increments and business writes commit or abort together.
    """
    alias = using or DEFAULT_DB_ALIAS
    normalized_scopes = tuple(sorted({str(scope).strip() for scope in scopes if str(scope).strip()}))
    if not normalized_scopes:
        raise ValueError('At least one workflow scope is required.')

    _ensure_scope_rows(normalized_scopes, alias)
    with transaction.atomic(using=alias):
        for scope in normalized_scopes:
            _increment_scope(scope, alias)
        yield


def coordinated_workflow(scope_resolver):
    """Decorate a complete operation with dynamically selected aggregate gates.

    Useful for request handlers where early-return validation must still happen
    under the same gate as the final writes. Resolver receives the original
    function arguments and returns one or more stable scope keys.
    """
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            scopes = scope_resolver(*args, **kwargs)
            if isinstance(scopes, str):
                scopes = (scopes,)
            with workflow_transaction(*scopes):
                return function(*args, **kwargs)

        return wrapped

    return decorate


def _has_transient_transaction_label(error):
    """Inspect wrapped driver exceptions without including sensitive details."""
    pending = [error]
    seen = set()
    while pending:
        current = pending.pop()
        if current is None or id(current) in seen:
            continue
        seen.add(id(current))
        has_label = getattr(current, 'has_error_label', None)
        if callable(has_label):
            try:
                if has_label('TransientTransactionError'):
                    return True
            except Exception:
                pass
        labels = getattr(current, '_error_labels', None)
        if labels and 'TransientTransactionError' in labels:
            return True
        pending.extend((getattr(current, '__cause__', None), getattr(current, '__context__', None)))
    return False


def retry_transient_mongo_transaction(max_attempts=MAX_TRANSIENT_TRANSACTION_RETRIES):
    """Retry a complete idempotent operation only for aborted transient txs."""
    if max_attempts < 1:
        raise ValueError('max_attempts must be at least one.')

    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            alias = kwargs.get('using') or DEFAULT_DB_ALIAS
            connection = connections[alias]
            if connection.vendor != 'mongodb':
                return function(*args, **kwargs)

            for attempt in range(max_attempts):
                try:
                    return function(*args, **kwargs)
                except Exception as error:
                    if not _has_transient_transaction_label(error) or attempt + 1 >= max_attempts:
                        raise
                    # The context manager normally aborts the failed transaction.
                    # Defensive cleanup covers driver errors raised while commit
                    # itself was being processed. Never replay an unknown commit.
                    if getattr(connection, 'session', None) is not None:
                        try:
                            connection.rollback_mongo()
                        except Exception:
                            pass
                    time.sleep(random.uniform(0.01, 0.05) * (attempt + 1))

        return wrapped

    return decorate
