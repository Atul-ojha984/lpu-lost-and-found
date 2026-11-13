"""Database-backed coordination records for cross-process workflows."""

from django.db import models


class WorkflowMutex(models.Model):
    """A tiny, private revision document used to serialize a workflow aggregate.

    ``scope`` is deliberately the primary key so MongoDB can perform an atomic
    single-document increment on the exact aggregate gate. The field contains
    only a resource type and opaque identifier, never personal or secret data.
    """

    scope = models.CharField(max_length=128, primary_key=True)
    revision = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_workflowmutex'
        verbose_name = 'Workflow coordination record'
        verbose_name_plural = 'Workflow coordination records'

    def __str__(self):
        return self.scope
