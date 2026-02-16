import type { PostIncidentReview, CrisisEvent } from '../types';
import { getCrisisById, updateCrisis } from './detection-service';

const reviewStore = new Map<string, PostIncidentReview>();

export async function generateReview(crisisId: string): Promise<PostIncidentReview> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  const timeline: { timestamp: Date; event: string; actor: string }[] = [
    { timestamp: crisis.detectedAt, event: 'Crisis detected', actor: 'SYSTEM' },
  ];

  if (crisis.acknowledgedAt) {
    timeline.push({ timestamp: crisis.acknowledgedAt, event: 'Crisis acknowledged', actor: 'HUMAN' });
  }

  for (const step of crisis.escalationChain) {
    if (step.notifiedAt) {
      timeline.push({ timestamp: step.notifiedAt, event: `${step.contactName} notified via ${step.contactMethod}`, actor: 'SYSTEM' });
    }
    if (step.acknowledgedAt) {
      timeline.push({ timestamp: step.acknowledgedAt, event: `${step.contactName} acknowledged`, actor: step.contactName });
    }
  }

  if (crisis.playbook) {
    for (const step of crisis.playbook.steps) {
      if (step.completedAt) {
        timeline.push({ timestamp: step.completedAt, event: `Playbook step completed: ${step.title}`, actor: 'HUMAN' });
      }
    }
  }

  if (crisis.resolvedAt) {
    timeline.push({ timestamp: crisis.resolvedAt, event: 'Crisis resolved', actor: 'HUMAN' });
  }

  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const review: PostIncidentReview = {
    crisisId,
    timeline,
    rootCause: 'To be determined during post-incident analysis.',
    whatWorked: crisis.warRoom.isActive ? ['War room was activated promptly'] : [],
    whatFailed: [],
    actionItems: [],
    lessonsLearned: [],
  };

  // Analyze escalation effectiveness
  const acknowledgedSteps = crisis.escalationChain.filter(s => s.status === 'ACKNOWLEDGED');
  if (acknowledgedSteps.length > 0) {
    review.whatWorked.push('Escalation chain resulted in acknowledgment');
  } else {
    review.whatFailed.push('No escalation steps were acknowledged');
  }

  reviewStore.set(crisisId, review);
  crisis.postIncidentReview = review;
  crisis.status = 'POST_MORTEM';
  updateCrisis(crisis);

  return review;
}

export async function addActionItem(
  crisisId: string,
  item: { title: string; assignee: string; dueDate: Date }
): Promise<PostIncidentReview> {
  const review = reviewStore.get(crisisId);
  if (!review) throw new Error(`Review for crisis ${crisisId} not found`);

  review.actionItems.push({ ...item, status: 'OPEN' });
  reviewStore.set(crisisId, review);

  const crisis = getCrisisById(crisisId);
  if (crisis) {
    crisis.postIncidentReview = review;
    updateCrisis(crisis);
  }

  return review;
}

export async function addLessonLearned(
  crisisId: string,
  lesson: string
): Promise<PostIncidentReview> {
  const review = reviewStore.get(crisisId);
  if (!review) throw new Error(`Review for crisis ${crisisId} not found`);

  review.lessonsLearned.push(lesson);
  reviewStore.set(crisisId, review);

  const crisis = getCrisisById(crisisId);
  if (crisis) {
    crisis.postIncidentReview = review;
    updateCrisis(crisis);
  }

  return review;
}
