import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import type { NextApiRequest, NextApiResponse } from 'next';

interface Contact {
  name: string;
  email: string;
  phoneNumber?: string;
}

interface ContactProperty {
  [key: string]: string[];
}

interface ContactsManager {
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<ContactProperty[]>;
  getProperties: () => Promise<string[]>;
}

interface NavigatorContacts extends Navigator {
  contacts?: ContactsManager;
}

export async function getGoogleContacts(accessToken: string): Promise<Contact[]> {
  try {
    const response = await fetch(
      'https://people.googleapis.com/v1/people/me/connections?' +
      new URLSearchParams({
        personFields: 'names,emailAddresses,phoneNumbers',
        pageSize: '1000'
      }).toString(),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Google Contacts API error: ${response.status}`);
    }

    const data = await response.json();
    const contacts: Contact[] = [];
    
    data.connections?.forEach((person: any) => {
      const name = person.names?.[0]?.displayName;
      const email = person.emailAddresses?.[0]?.value;
      
      if (name && email) {
        contacts.push({
          name,
          email,
          phoneNumber: person.phoneNumbers?.[0]?.value,
        });
      }
    });

    return contacts;
  } catch (error) {
    console.error('Failed to fetch Google contacts:', error);
    return [];
  }
}

export async function resolveContactsFromText(text: string, accessToken: string): Promise<Contact[]> {
  const contacts = await getGoogleContacts(accessToken);
  const resolvedContacts: Contact[] = [];
  
  // Split text into potential contact identifiers
  const words = text.toLowerCase().split(/[\s,]+/);
  
  // Try to match each word against contact names or emails
  words.forEach(word => {
    contacts.forEach(contact => {
      if (
        contact.name.toLowerCase().includes(word) ||
        contact.email.toLowerCase().includes(word)
      ) {
        if (!resolvedContacts.some(c => c.email === contact.email)) {
          resolvedContacts.push(contact);
        }
      }
    });
  });
  
  return resolvedContacts;
}

export async function getContactsForUser(req: NextApiRequest, res: NextApiResponse): Promise<Contact[]> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.accessToken) return [];
  return getGoogleContacts(session.accessToken);
}

export function isContactPickerSupported(): boolean {
  return typeof window !== 'undefined' && 
         'contacts' in navigator && 
         'select' in ((navigator as NavigatorContacts).contacts || {});
}

export async function requestContactPermissions(): Promise<boolean> {
  if (!isContactPickerSupported()) {
    return false;
  }

  try {
    const nav = navigator as NavigatorContacts;
    const supported = await nav.contacts?.getProperties();
    return supported ? supported.includes('name') && supported.includes('email') : false;
  } catch (error) {
    console.error('Error checking contact permissions:', error);
    return false;
  }
}

export async function selectContacts(): Promise<Contact[]> {
  if (!isContactPickerSupported()) {
    return [];
  }

  try {
    const nav = navigator as NavigatorContacts;
    const contacts = await nav.contacts?.select(
      ['name', 'email', 'tel'],
      { multiple: true }
    ) || [];

    return contacts.map(contact => ({
      name: Array.isArray(contact.name) ? contact.name[0] : '',
      email: Array.isArray(contact.email) ? contact.email[0] : '',
      phoneNumber: Array.isArray(contact.tel) ? contact.tel[0] : undefined,
    }));
  } catch (error) {
    console.error('Error selecting contacts:', error);
    return [];
  }
} 