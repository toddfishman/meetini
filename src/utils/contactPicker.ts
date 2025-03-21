interface ContactResult {
  name: string[];
  email: string[];
  tel: string[];
}

export async function isContactPickerSupported(): Promise<boolean> {
  return 'contacts' in navigator && 'ContactsManager' in window;
}

export async function pickContacts(): Promise<Array<{
  name: string;
  email: string;
  source: 'phone';
  confidence: number;
}>> {
  if (!await isContactPickerSupported()) {
    throw new Error('Contact Picker API is not supported in this browser');
  }

  try {
    const contacts = await (navigator as any).contacts.select(
      ['name', 'email', 'tel'],
      { multiple: true }
    ) as ContactResult[];

    return contacts
      .filter(contact => contact.email && contact.email.length > 0)
      .map(contact => ({
        name: contact.name[0] || 'Unknown',
        email: contact.email[0],
        source: 'phone' as const,
        confidence: 0.9 // High confidence since these are direct phone contacts
      }));
  } catch (error) {
    if ((error as Error).name === 'SecurityError') {
      throw new Error('Permission denied to access contacts');
    }
    throw error;
  }
}
