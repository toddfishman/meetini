interface Contact {
  name?: string;
  email?: string;
  phoneNumber?: string;
}

export async function requestContactPermissions(): Promise<boolean> {
  if ('contacts' in navigator && 'select' in (navigator as any).contacts) {
    try {
      const props = ['name', 'email', 'tel'];
      const supported = await (navigator as any).contacts.getProperties();
      
      if (supported.every((prop: string) => props.includes(prop))) {
        // Request permission by attempting to select contacts
        const contacts = await (navigator as any).contacts.select(props);
        return contacts !== null;
      }
    } catch (error) {
      console.error('Failed to request contact permissions:', error);
      return false;
    }
  }
  return false;
}

export async function selectContacts(): Promise<Contact[]> {
  if (!('contacts' in navigator && 'select' in (navigator as any).contacts)) {
    throw new Error('Contact Picker API not supported');
  }

  try {
    const contacts = await (navigator as any).contacts.select(
      ['name', 'email', 'tel'],
      { multiple: true }
    );

    return contacts.map((contact: any) => ({
      name: contact.name?.[0],
      email: contact.email?.[0],
      phoneNumber: contact.tel?.[0],
    }));
  } catch (error) {
    console.error('Failed to select contacts:', error);
    throw error;
  }
}

export function isContactPickerSupported(): boolean {
  return 'contacts' in navigator && 'select' in (navigator as any).contacts;
} 