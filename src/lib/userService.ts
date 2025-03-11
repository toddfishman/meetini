interface UserStatus {
  isMeetiniUser: boolean;
  preferences: any;
  name: string | null;
}

export async function checkUserStatuses(emails: string[]): Promise<Record<string, UserStatus>> {
  const response = await fetch('/api/users/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails })
  });

  if (!response.ok) {
    throw new Error('Failed to check user status');
  }

  const { users } = await response.json();
  return users;
}
