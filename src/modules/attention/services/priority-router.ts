import { v4 as uuidv4 } from 'uuid';
import type { NotificationItem, PriorityRouting } from '../types';
import { consumeBudget } from './attention-budget-service';
import { isDNDActive, checkVIPBreakthrough } from './dnd-service';

const routingConfigStore = new Map<string, PriorityRouting[]>();

function getDefaultRouting(): PriorityRouting[] {
  return [
    { priority: 'P0', action: 'INTERRUPT', channels: ['push', 'sms'] },
    { priority: 'P1', action: 'NEXT_DIGEST', channels: ['email'] },
    { priority: 'P2', action: 'WEEKLY_REVIEW', channels: ['email'] },
  ];
}

const notificationStore = new Map<string, NotificationItem>();

export async function routeNotification(
  userId: string,
  notification: Omit<NotificationItem, 'id' | 'routedAction' | 'isRead' | 'isBundled' | 'createdAt'>
): Promise<NotificationItem> {
  let routedAction: NotificationItem['routedAction'];

  const dndActive = await isDNDActive(userId);

  if (notification.priority === 'P0') {
    if (dndActive) {
      const isVIP = await checkVIPBreakthrough(userId, notification.source);
      if (isVIP) {
        routedAction = 'INTERRUPT';
      } else {
        routedAction = 'NEXT_DIGEST';
      }
    } else {
      const { allowed } = await consumeBudget(userId);
      routedAction = allowed ? 'INTERRUPT' : 'NEXT_DIGEST';
    }
  } else if (notification.priority === 'P1') {
    routedAction = 'NEXT_DIGEST';
  } else {
    routedAction = 'WEEKLY_REVIEW';
  }

  const item: NotificationItem = {
    ...notification,
    id: uuidv4(),
    routedAction,
    isRead: false,
    isBundled: false,
    createdAt: new Date(),
  };

  notificationStore.set(item.id, item);
  return item;
}

export async function getRoutingConfig(userId: string): Promise<PriorityRouting[]> {
  return routingConfigStore.get(userId) || getDefaultRouting();
}

export async function updateRoutingConfig(userId: string, config: PriorityRouting[]): Promise<void> {
  routingConfigStore.set(userId, config);
}

export { notificationStore, routingConfigStore };
