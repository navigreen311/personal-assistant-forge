import { prisma } from '@/lib/db';
import type { TaskContext } from '../types';

export async function loadTaskContext(taskId: string): Promise<TaskContext> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const [relatedDocuments, relatedMessages, relatedContacts, relatedNotes, previousActivity] =
    await Promise.all([
      findRelatedDocuments(task),
      findRelatedMessages(task),
      findRelatedContacts(task),
      findRelatedNotes(task),
      findPreviousActivity(taskId),
    ]);

  const linkedUrls = extractUrls(relatedDocuments, relatedMessages);

  return {
    taskId,
    relatedDocuments,
    relatedMessages,
    relatedContacts,
    relatedNotes,
    linkedUrls,
    previousActivity,
  };
}

async function findRelatedDocuments(
  task: { entityId: string; projectId: string | null; tags: string[] }
): Promise<Array<{ id: string; title: string; type: string }>> {
  const documents = await prisma.document.findMany({
    where: {
      entityId: task.entityId,
    },
    take: 20,
  });

  // Score relevance by tag overlap and project association
  const scored = documents.map((doc) => {
    let score = 0;
    const docTitle = doc.title.toLowerCase();

    for (const tag of task.tags) {
      if (docTitle.includes(tag.toLowerCase())) score += 2;
    }

    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({
      id: s.doc.id,
      title: s.doc.title,
      type: s.doc.type,
    }));
}

async function findRelatedMessages(
  task: { entityId: string; title: string; createdFrom: unknown; tags: string[] }
): Promise<Array<{ id: string; subject?: string; channel: string; preview: string }>> {
  const createdFrom = task.createdFrom as { type?: string; sourceId?: string } | null;

  // If task was created from a message, fetch that message
  if (createdFrom?.type === 'MESSAGE' && createdFrom.sourceId) {
    const sourceMessage = await prisma.message.findUnique({
      where: { id: createdFrom.sourceId },
    });
    if (sourceMessage) {
      return [{
        id: sourceMessage.id,
        subject: sourceMessage.subject ?? undefined,
        channel: sourceMessage.channel,
        preview: sourceMessage.body.slice(0, 200),
      }];
    }
  }

  // Search messages mentioning the task title
  const messages = await prisma.message.findMany({
    where: {
      entityId: task.entityId,
      body: { contains: task.title.split(' ')[0], mode: 'insensitive' },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  return messages.map((m) => ({
    id: m.id,
    subject: m.subject ?? undefined,
    channel: m.channel,
    preview: m.body.slice(0, 200),
  }));
}

async function findRelatedContacts(
  task: { entityId: string; assigneeId: string | null }
): Promise<Array<{ id: string; name: string; role?: string }>> {
  const contacts: Array<{ id: string; name: string; role?: string }> = [];

  // Add assignee
  if (task.assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: task.assigneeId } });
    if (user) {
      contacts.push({ id: user.id, name: user.name, role: 'Assignee' });
    }
  }

  // Find contacts from the same entity
  const entityContacts = await prisma.contact.findMany({
    where: { entityId: task.entityId },
    take: 5,
    orderBy: { lastTouch: 'desc' },
  });

  for (const contact of entityContacts) {
    if (!contacts.some((c) => c.id === contact.id)) {
      contacts.push({ id: contact.id, name: contact.name });
    }
  }

  return contacts.slice(0, 5);
}

async function findRelatedNotes(
  task: { entityId: string; tags: string[] }
): Promise<string[]> {
  if (task.tags.length === 0) return [];

  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      entityId: task.entityId,
      tags: { hasSome: task.tags },
    },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  return entries.map((e) => e.content.slice(0, 300));
}

async function findPreviousActivity(
  taskId: string
): Promise<Array<{ action: string; date: Date; actor: string }>> {
  const logs = await prisma.actionLog.findMany({
    where: { target: taskId },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  return logs.map((log) => ({
    action: `${log.actionType}: ${log.reason}`,
    date: log.timestamp,
    actor: log.actor,
  }));
}

function extractUrls(
  documents: Array<{ id: string; title: string; type: string }>,
  messages: Array<{ id: string; preview: string }>
): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const urls = new Set<string>();

  for (const msg of messages) {
    const matches = msg.preview.match(urlPattern);
    if (matches) {
      for (const url of matches) {
        urls.add(url);
      }
    }
  }

  return [...urls];
}
