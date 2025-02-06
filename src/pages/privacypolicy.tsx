import React from 'react';

const PrivacyPolicy = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Privacy Policy for Meetini</h1>
      <p className="mb-4">Effective Date: [Insert Date]</p>
      <p className="mb-4">At Meetini, we are committed to protecting your privacy and ensuring that your personal information is handled securely. This Privacy Policy explains how we collect, use, and protect your data when you use the Meetini app and associated services.</p>
      <h2 className="text-2xl font-bold mb-2">1. Information We Collect</h2>
      <ul className="list-disc pl-5 mb-4">
        <li>Calendar Data: With your permission, we access your calendar to analyze availability and suggest meeting times. We do not share your calendar data with other participants.</li>
        <li>Contact Information: If you choose to sync your contacts, we use this information to facilitate meeting invitations. Contact data is not shared or stored beyond the app's functionality.</li>
        <li>Location Data: We use GPS to suggest convenient meeting locations. Location data is used in real-time and not stored.</li>
        <li>Usage Data: We collect anonymous data on app performance and usage to improve functionality and user experience.</li>
      </ul>
      <h2 className="text-2xl font-bold mb-2">2. How We Use Your Information</h2>
      <ul className="list-disc pl-5 mb-4">
        <li>To identify optimal meeting times, locations, and platforms.</li>
        <li>To facilitate meeting invitations and confirmations.</li>
        <li>To provide personalized recommendations based on your preferences.</li>
        <li>To improve app performance and troubleshoot issues.</li>
        <li>To comply with legal obligations or respond to lawful requests.</li>
      </ul>
      <h2 className="text-2xl font-bold mb-2">3. Data Sharing and Security</h2>
      <ul className="list-disc pl-5 mb-4">
        <li>Data Sharing: We do not sell, rent, or share your personal data with third parties, except as necessary to provide app functionality (e.g., integrating with calendar platforms).</li>
        <li>Data Security: We implement encryption, secure authentication, and access controls to protect your data. While we take every measure to safeguard your information, no system is 100% secure.</li>
      </ul>
      <h2 className="text-2xl font-bold mb-2">4. Your Privacy Choices</h2>
      <ul className="list-disc pl-5 mb-4">
        <li>Permissions: You control which permissions (e.g., calendar, contacts, location) to grant. You can adjust permissions anytime through your device settings.</li>
        <li>Account Deletion: You may delete your account at any time, which will remove all associated data from our servers.</li>
      </ul>
      <h2 className="text-2xl font-bold mb-2">5. Third-Party Integrations</h2>
      <p className="mb-4">Meetini integrates with third-party platforms such as Google Calendar, Microsoft Outlook, and Zoom. These platforms have their own privacy policies, which we encourage you to review.</p>
      <h2 className="text-2xl font-bold mb-2">6. Children's Privacy</h2>
      <p className="mb-4">Meetini is not intended for use by individuals under 13 years old. We do not knowingly collect personal data from children. If we learn that we have inadvertently collected such data, we will delete it promptly.</p>
      <h2 className="text-2xl font-bold mb-2">7. Changes to This Privacy Policy</h2>
      <p className="mb-4">We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of significant changes through the app or email.</p>
      <h2 className="text-2xl font-bold mb-2">8. Contact Us</h2>
      <p className="mb-4">If you have any questions or concerns about this Privacy Policy, please contact us at:</p>
      <p className="mb-4">Email: support@meetini.com</p>
      <p className="mb-4">Address: [Insert Address]</p>
      <p>Thank you for trusting Meetini to simplify your scheduling needs.</p>
    </div>
  );
};

export default PrivacyPolicy; 
