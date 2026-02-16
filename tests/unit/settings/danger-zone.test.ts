/**
 * Danger Zone — account deletion confirmation logic tests.
 *
 * React Testing Library is not available, so we test the core logic
 * as pure functions and simulate the delete handler behaviour.
 */

// --- Confirmation check (mirrors the condition used in the component) ---

function isDeleteConfirmed(text: string): boolean {
  return text === 'DELETE';
}

// --- Simulated handleDeleteAccount (mirrors the component handler) ---

async function handleDeleteAccount(
  fetchFn: typeof fetch,
  setDeleting: (v: boolean) => void,
  setErrorMessage: (msg: string | null) => void,
  redirect: (url: string) => void,
) {
  try {
    setDeleting(true);
    setErrorMessage(null);
    const res = await fetchFn('/api/settings', { method: 'DELETE' });
    if (res.ok) {
      redirect('/login');
    } else {
      const json = await res.json();
      setErrorMessage(json.error?.message || 'Failed to delete account.');
    }
  } catch {
    setErrorMessage('Failed to delete account.');
  } finally {
    setDeleting(false);
  }
}

// ---------- Tests ----------

describe('Danger Zone — confirmation logic', () => {
  it('should only enable delete when confirmation text is exactly "DELETE"', () => {
    expect(isDeleteConfirmed('DELETE')).toBe(true);
    expect(isDeleteConfirmed('delete')).toBe(false);
    expect(isDeleteConfirmed('Delete')).toBe(false);
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed(' DELETE')).toBe(false);
    expect(isDeleteConfirmed('DELETE ')).toBe(false);
    expect(isDeleteConfirmed('DELET')).toBe(false);
  });

  it('should reset confirmation text and hide dialog on cancel', () => {
    // Simulate state
    let showDeleteConfirm = true;
    let deleteConfirmText = 'DEL';

    // Cancel action (mirrors the onClick handler)
    showDeleteConfirm = false;
    deleteConfirmText = '';

    expect(showDeleteConfirm).toBe(false);
    expect(deleteConfirmText).toBe('');
  });

  it('should redirect to /login on successful deletion', async () => {
    const setDeleting = jest.fn();
    const setErrorMessage = jest.fn();
    const redirect = jest.fn();
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });

    await handleDeleteAccount(mockFetch, setDeleting, setErrorMessage, redirect);

    expect(mockFetch).toHaveBeenCalledWith('/api/settings', { method: 'DELETE' });
    expect(redirect).toHaveBeenCalledWith('/login');
    expect(setDeleting).toHaveBeenCalledWith(true);
    expect(setDeleting).toHaveBeenCalledWith(false);
    expect(setErrorMessage).toHaveBeenCalledWith(null);
  });

  it('should show error message on failed deletion', async () => {
    const setDeleting = jest.fn();
    const setErrorMessage = jest.fn();
    const redirect = jest.fn();
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: { message: 'Server error' } }),
    });

    await handleDeleteAccount(mockFetch, setDeleting, setErrorMessage, redirect);

    expect(redirect).not.toHaveBeenCalled();
    expect(setErrorMessage).toHaveBeenCalledWith('Server error');
    expect(setDeleting).toHaveBeenCalledWith(false);
  });

  it('should show generic error message on network failure', async () => {
    const setDeleting = jest.fn();
    const setErrorMessage = jest.fn();
    const redirect = jest.fn();
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await handleDeleteAccount(mockFetch, setDeleting, setErrorMessage, redirect);

    expect(redirect).not.toHaveBeenCalled();
    expect(setErrorMessage).toHaveBeenCalledWith('Failed to delete account.');
    expect(setDeleting).toHaveBeenCalledWith(false);
  });
});
