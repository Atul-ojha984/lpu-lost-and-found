"""Route application transactions to the configured database backend safely.

The MongoDB backend has a custom transaction API and no savepoints. This
module keeps PostgreSQL behavior unchanged, uses the official Mongo API when
MongoDB is configured, and aborts a Mongo transaction if a nested application
atomic block raises an exception that is later caught by its caller.
"""

from contextlib import ContextDecorator
from threading import local

from django.db import DEFAULT_DB_ALIAS, connections, transaction as django_transaction


class MongoNestedAtomicError(RuntimeError):
    """Raised when unsupported nested savepoint semantics would be unsafe."""


class _MongoRollbackSignal(Exception):
    """Internal signal used to abort Mongo atomic context without leaking out."""


_mongo_state = local()


def _mongo_states():
    if not hasattr(_mongo_state, 'connections'):
        _mongo_state.connections = {}
    return _mongo_state.connections


def _is_mongodb(using=None):
    return connections[using or DEFAULT_DB_ALIAS].vendor == 'mongodb'


class _AtomicDispatcher(ContextDecorator):
    def __init__(self, using=None, savepoint=True, durable=False):
        self.using = using
        self.savepoint = savepoint
        self.durable = durable
        self.delegate = None
        self.mongo = False
        self.state = None

    def _recreate_cm(self):
        return self.__class__(self.using, self.savepoint, self.durable)

    def __enter__(self):
        alias = self.using or DEFAULT_DB_ALIAS
        self.mongo = _is_mongodb(alias)
        if not self.mongo:
            self.delegate = django_transaction.atomic(
                using=self.using,
                savepoint=self.savepoint,
                durable=self.durable,
            )
            return self.delegate.__enter__()

        if self.durable:
            raise RuntimeError('durable=True is not supported by Django MongoDB Backend transactions.')

        from django_mongodb_backend import transaction as mongo_transaction

        states = _mongo_states()
        self.state = states.setdefault(
            alias,
            {'depth': 0, 'rollback_only': False, 'nested_failure': False},
        )
        if self.state['depth'] == 0:
            self.state['rollback_only'] = False
            self.state['nested_failure'] = False
        self.state['depth'] += 1
        self.delegate = mongo_transaction.atomic(using=alias)
        try:
            return self.delegate.__enter__()
        except BaseException:
            self.state['depth'] -= 1
            if self.state['depth'] == 0:
                states.pop(alias, None)
            raise

    def __exit__(self, exc_type, exc_value, traceback):
        if not self.mongo:
            return self.delegate.__exit__(exc_type, exc_value, traceback)

        alias = self.using or DEFAULT_DB_ALIAS
        states = _mongo_states()
        self.state['depth'] -= 1
        if exc_type is not None:
            self.state['rollback_only'] = True
            if self.state['depth'] > 0:
                self.state['nested_failure'] = True

        is_outermost = self.state['depth'] == 0
        caught_nested_failure = is_outermost and self.state['nested_failure'] and exc_type is None
        if caught_nested_failure:
            failure = MongoNestedAtomicError(
                'A nested MongoDB transaction block failed and was caught. '
                'MongoDB has no savepoints, so the outer transaction was aborted.'
            )
            try:
                self.delegate.__exit__(MongoNestedAtomicError, failure, traceback)
            finally:
                states.pop(alias, None)
            raise failure

        explicit_rollback = is_outermost and self.state['rollback_only'] and exc_type is None
        if explicit_rollback:
            try:
                self.delegate.__exit__(
                    _MongoRollbackSignal,
                    _MongoRollbackSignal(),
                    traceback,
                )
                return False
            finally:
                states.pop(alias, None)

        try:
            return self.delegate.__exit__(exc_type, exc_value, traceback)
        finally:
            if is_outermost:
                states.pop(alias, None)


def atomic(using=None, savepoint=True, durable=False):
    """Backend-aware replacement for the application's transaction.atomic."""
    if callable(using):
        function = using
        return _AtomicDispatcher()(function)
    return _AtomicDispatcher(using=using, savepoint=savepoint, durable=durable)


def on_commit(func, using=None, robust=False):
    """Register a callback through the configured backend's commit hook."""
    if _is_mongodb(using):
        from django_mongodb_backend import transaction as mongo_transaction

        return mongo_transaction.on_commit(func, using=using, robust=robust)
    return django_transaction.on_commit(func, using=using, robust=robust)


def set_rollback(rollback, using=None):
    """Mark an active transaction rollback-only on either supported backend."""
    alias = using or DEFAULT_DB_ALIAS
    if not _is_mongodb(alias):
        return django_transaction.set_rollback(rollback, using=using)

    state = _mongo_states().get(alias)
    if not state or state['depth'] == 0:
        raise RuntimeError('set_rollback() requires an active MongoDB transaction.')
    if not rollback and state['nested_failure']:
        raise MongoNestedAtomicError(
            'MongoDB transactions do not support clearing rollback after a nested failure.'
        )
    state['rollback_only'] = bool(rollback)


class _TransactionFacade:
    atomic = staticmethod(atomic)
    on_commit = staticmethod(on_commit)
    set_rollback = staticmethod(set_rollback)


transaction = _TransactionFacade()
