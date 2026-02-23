/**
 * @jest-environment jsdom
 */

// ============================================================================
// Shadow Voice Agent — UI Component Tests
// Tests for ShadowBubble, ShadowPanel, ShadowActionCard, ShadowConfirmCard,
// ShadowNavButton rendering and interactions
// ============================================================================

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/navigation since components use useRouter
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/dashboard',
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ShadowBubble } from '@/components/shadow/ShadowBubble';
import { ShadowActionCard } from '@/components/shadow/ShadowActionCard';
import { ShadowConfirmCard } from '@/components/shadow/ShadowConfirmCard';
import { ShadowNavButton } from '@/components/shadow/ShadowNavButton';
import { ShadowPanel } from '@/components/shadow/ShadowPanel';
import type { ShadowMessage } from '@/hooks/useShadowContext';

// ============================================================================
// ShadowBubble
// ============================================================================

describe('ShadowBubble', () => {
  it('should render with no badge when pendingCount is 0', () => {
    render(
      <ShadowBubble
        onClick={jest.fn()}
        isExpanded={false}
        pendingCount={0}
        isSidekick={false}
        isSessionActive={false}
      />,
    );

    const button = screen.getByRole('button', { name: /open shadow assistant/i });
    expect(button).toBeInTheDocument();
    // No badge text should appear
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('should render with notification badge when pendingCount > 0', () => {
    render(
      <ShadowBubble
        onClick={jest.fn()}
        isExpanded={false}
        pendingCount={3}
        isSidekick={false}
        isSessionActive={false}
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should show 9+ when pendingCount exceeds 9', () => {
    render(
      <ShadowBubble
        onClick={jest.fn()}
        isExpanded={false}
        pendingCount={15}
        isSidekick={false}
        isSessionActive={false}
      />,
    );

    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('should hide badge when panel is expanded', () => {
    render(
      <ShadowBubble
        onClick={jest.fn()}
        isExpanded={true}
        pendingCount={5}
        isSidekick={false}
        isSessionActive={false}
      />,
    );

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(
      <ShadowBubble
        onClick={handleClick}
        isExpanded={false}
        pendingCount={0}
        isSidekick={false}
        isSessionActive={false}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should show close label when expanded', () => {
    render(
      <ShadowBubble
        onClick={jest.fn()}
        isExpanded={true}
        pendingCount={0}
        isSidekick={false}
        isSessionActive={false}
      />,
    );

    expect(screen.getByLabelText(/close shadow assistant/i)).toBeInTheDocument();
  });
});

// ============================================================================
// ShadowPanel
// ============================================================================

describe('ShadowPanel', () => {
  const mockMessages: ShadowMessage[] = [
    {
      id: 'msg-1',
      role: 'shadow',
      content: 'Hello! How can I help you?',
      contentType: 'TEXT',
      timestamp: new Date('2026-02-23T10:00:00Z'),
    },
    {
      id: 'msg-2',
      role: 'user',
      content: 'Show me my tasks',
      contentType: 'TEXT',
      timestamp: new Date('2026-02-23T10:00:05Z'),
    },
    {
      id: 'msg-3',
      role: 'shadow',
      content: 'Here are your tasks for today.',
      contentType: 'TEXT',
      timestamp: new Date('2026-02-23T10:00:06Z'),
    },
  ];

  const defaultProps = {
    messages: mockMessages,
    isProcessing: false,
    entityName: 'MedLink',
    isVoiceActive: false,
    onSendMessage: jest.fn(),
    onSendActionResponse: jest.fn(),
    onClose: jest.fn(),
    onMinimize: jest.fn(),
    onToggleVoice: jest.fn(),
  };

  it('should render message list with all messages', () => {
    render(<ShadowPanel {...defaultProps} />);

    expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    expect(screen.getByText('Show me my tasks')).toBeInTheDocument();
    expect(screen.getByText('Here are your tasks for today.')).toBeInTheDocument();
  });

  it('should render the header with Shadow title and entity badge', () => {
    render(<ShadowPanel {...defaultProps} />);

    expect(screen.getByText('Shadow')).toBeInTheDocument();
    expect(screen.getByText('MedLink')).toBeInTheDocument();
  });

  it('should render text input and send button', () => {
    render(<ShadowPanel {...defaultProps} />);

    expect(screen.getByPlaceholderText(/ask shadow anything/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/send message/i)).toBeInTheDocument();
  });

  it('should show typing indicator when processing', () => {
    render(<ShadowPanel {...defaultProps} isProcessing={true} />);

    expect(screen.getByText(/shadow is thinking/i)).toBeInTheDocument();
  });

  it('should call onSendMessage when send button is clicked', () => {
    const onSendMessage = jest.fn();
    render(<ShadowPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByPlaceholderText(/ask shadow anything/i);
    fireEvent.change(input, { target: { value: 'Hello Shadow' } });
    fireEvent.click(screen.getByLabelText(/send message/i));

    expect(onSendMessage).toHaveBeenCalledWith('Hello Shadow');
  });

  it('should call onSendMessage when Enter is pressed', () => {
    const onSendMessage = jest.fn();
    render(<ShadowPanel {...defaultProps} onSendMessage={onSendMessage} />);

    const input = screen.getByPlaceholderText(/ask shadow anything/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<ShadowPanel {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText(/close panel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onMinimize when minimize button is clicked', () => {
    const onMinimize = jest.fn();
    render(<ShadowPanel {...defaultProps} onMinimize={onMinimize} />);

    fireEvent.click(screen.getByLabelText(/minimize panel/i));
    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it('should render empty state when no messages', () => {
    render(<ShadowPanel {...defaultProps} messages={[]} />);

    expect(screen.getByText(/start a conversation with shadow/i)).toBeInTheDocument();
  });

  it('should not send empty messages', () => {
    const onSendMessage = jest.fn();
    render(<ShadowPanel {...defaultProps} onSendMessage={onSendMessage} />);

    fireEvent.click(screen.getByLabelText(/send message/i));
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ShadowActionCard
// ============================================================================

describe('ShadowActionCard', () => {
  const defaultProps = {
    id: 'action-1',
    title: 'Approve Invoice',
    description: 'Invoice #1234 needs your approval.',
    options: [
      { label: 'Approve', action: 'approve', style: 'primary' as const },
      { label: 'Reject', action: 'reject', style: 'danger' as const },
      { label: 'Later', action: 'defer', style: 'secondary' as const },
    ],
    onResponse: jest.fn(),
  };

  it('should render title and description', () => {
    render(<ShadowActionCard {...defaultProps} />);

    expect(screen.getByText('Approve Invoice')).toBeInTheDocument();
    expect(screen.getByText('Invoice #1234 needs your approval.')).toBeInTheDocument();
  });

  it('should render all option buttons', () => {
    render(<ShadowActionCard {...defaultProps} />);

    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
  });

  it('should call onResponse with correct action when button is clicked', () => {
    const onResponse = jest.fn();
    render(<ShadowActionCard {...defaultProps} onResponse={onResponse} />);

    fireEvent.click(screen.getByText('Approve'));

    expect(onResponse).toHaveBeenCalledWith('action-1', 'approve');
  });

  it('should show responded text and disable buttons after a response', () => {
    render(<ShadowActionCard {...defaultProps} />);

    fireEvent.click(screen.getByText('Reject'));

    // After response, should show result
    expect(screen.getByText(/responded: reject/i)).toBeInTheDocument();
    // Original buttons should be gone
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });

  it('should disable buttons when disabled prop is true', () => {
    render(<ShadowActionCard {...defaultProps} disabled={true} />);

    const approveButton = screen.getByText('Approve');
    expect(approveButton).toBeDisabled();
  });

  it('should not call onResponse when disabled', () => {
    const onResponse = jest.fn();
    render(<ShadowActionCard {...defaultProps} onResponse={onResponse} disabled={true} />);

    fireEvent.click(screen.getByText('Approve'));
    expect(onResponse).not.toHaveBeenCalled();
  });
});

// ============================================================================
// ShadowConfirmCard
// ============================================================================

describe('ShadowConfirmCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render confirmation message with green checkmark', () => {
    render(
      <ShadowConfirmCard
        message="Invoice approved successfully"
        canUndo={false}
      />,
    );

    expect(screen.getByText('Invoice approved successfully')).toBeInTheDocument();
  });

  it('should show undo button with countdown when canUndo is true', () => {
    render(
      <ShadowConfirmCard
        message="Task completed"
        canUndo={true}
        undoDeadlineSeconds={5}
        onUndo={jest.fn()}
      />,
    );

    expect(screen.getByText(/undo \(5s\)/i)).toBeInTheDocument();
  });

  it('should countdown the undo timer', () => {
    render(
      <ShadowConfirmCard
        message="Task completed"
        canUndo={true}
        undoDeadlineSeconds={5}
        onUndo={jest.fn()}
      />,
    );

    expect(screen.getByText(/undo \(5s\)/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/undo \(4s\)/i)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByText(/undo \(2s\)/i)).toBeInTheDocument();
  });

  it('should show "Undo window expired" after countdown completes', () => {
    render(
      <ShadowConfirmCard
        message="Task completed"
        canUndo={true}
        undoDeadlineSeconds={3}
        onUndo={jest.fn()}
      />,
    );

    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.getByText(/undo window expired/i)).toBeInTheDocument();
    expect(screen.queryByText(/undo \(/)).not.toBeInTheDocument();
  });

  it('should call onUndo when undo button is clicked', () => {
    const onUndo = jest.fn();
    render(
      <ShadowConfirmCard
        message="Task completed"
        canUndo={true}
        undoDeadlineSeconds={10}
        onUndo={onUndo}
      />,
    );

    fireEvent.click(screen.getByText(/undo \(10s\)/i));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('should show "Action undone" after clicking undo', () => {
    render(
      <ShadowConfirmCard
        message="Task completed"
        canUndo={true}
        undoDeadlineSeconds={10}
        onUndo={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/undo \(10s\)/i));
    expect(screen.getByText(/action undone/i)).toBeInTheDocument();
  });

  it('should render "View receipt" link when receiptId is provided', () => {
    render(
      <ShadowConfirmCard
        message="Payment processed"
        canUndo={false}
        receiptId="receipt-123"
      />,
    );

    expect(screen.getByText(/view receipt/i)).toBeInTheDocument();
  });

  it('should not show undo button when canUndo is false', () => {
    render(
      <ShadowConfirmCard
        message="Done"
        canUndo={false}
      />,
    );

    expect(screen.queryByText(/undo/i)).not.toBeInTheDocument();
  });
});

// ============================================================================
// ShadowNavButton
// ============================================================================

describe('ShadowNavButton', () => {
  it('should render with gray text when no session', () => {
    render(
      <ShadowNavButton
        sessionStatus="none"
        onClick={jest.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /shadow voice assistant/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Shadow')).toBeInTheDocument();
  });

  it('should display green dot and timer when session is active', () => {
    render(
      <ShadowNavButton
        sessionStatus="active"
        sessionDuration={154}
        entityName="MedLink"
        onClick={jest.fn()}
      />,
    );

    // Timer: 154 seconds = 2:34
    expect(screen.getByText('2:34')).toBeInTheDocument();
    // Entity name
    expect(screen.getByText('MedLink')).toBeInTheDocument();
    // Status dot
    expect(screen.getByLabelText(/status: active/i)).toBeInTheDocument();
  });

  it('should display blue dot in sidekick mode', () => {
    render(
      <ShadowNavButton
        sessionStatus="sidekick"
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/status: sidekick/i)).toBeInTheDocument();
  });

  it('should display yellow dot and "paused" text in paused mode', () => {
    render(
      <ShadowNavButton
        sessionStatus="paused"
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/status: paused/i)).toBeInTheDocument();
    expect(screen.getByText('paused')).toBeInTheDocument();
  });

  it('should show pending count badge', () => {
    render(
      <ShadowNavButton
        sessionStatus="active"
        pendingCount={3}
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should show 9+ for pending counts over 9', () => {
    render(
      <ShadowNavButton
        sessionStatus="active"
        pendingCount={12}
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(
      <ShadowNavButton
        sessionStatus="none"
        onClick={handleClick}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should auto-increment timer when active', () => {
    jest.useFakeTimers();

    render(
      <ShadowNavButton
        sessionStatus="active"
        sessionDuration={0}
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByText('0:00')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.getByText('0:03')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('should not show timer when session status is none', () => {
    render(
      <ShadowNavButton
        sessionStatus="none"
        sessionDuration={100}
        onClick={jest.fn()}
      />,
    );

    // Timer format "1:40" should not appear
    expect(screen.queryByText('1:40')).not.toBeInTheDocument();
  });
});
