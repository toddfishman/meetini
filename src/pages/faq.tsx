import React from 'react';
import Navbar from '../components/Navbar';
import Image from 'next/image';

const faqs = [
  {
    question: "What is Meetini?",
    answer: "Meetini is a smart scheduling app that uses AI, machine learning, GPS, and calendar integration to seamlessly find the best time, place, and medium for meetings, whether virtual or in-person."
  },
  {
    question: "How does Meetini work?",
    answer: "Meetini analyzes your calendar, location, preferences, and meeting requirements. It syncs with participants' schedules and preferences and suggests the most convenient options for everyone automatically or manually if preferred."
  },
  {
    question: "What types of meetings can I schedule with Meetini?",
    answer: "You can schedule everything from casual coffee meetups to one person to a formal team meeting, virtual catch-ups, outdoor activities - really anything!"
  },
  {
    question: "Does Meetini support virtual meetings?",
    answer: "Yes! Meetini can schedule virtual meetings on platforms like Zoom, Microsoft Teams, or Google Meet. It identifies the most convenient time for all participants and will place meeting links and numbers in the calendar invitations."
  },
  {
    question: "Can I use Meetini for group scheduling?",
    answer: "Absolutely! Meetini excels at coordinating groups of two or more peoples' schedules. It evaluates everyone's availability and picks the best option which can be daunting for larger groups."
  },
  {
    question: "How does Meetini choose a location?",
    answer: "For in-person meetings, Meetini uses GPS data to suggest convenient locations for all attendees, considering travel times and preferences, but manual choices can be entered as well."
  },
  {
    question: "Is my calendar data secure and private?",
    answer: "Yes, Meetini prioritizes your privacy. Your calendar data is analyzed privately, and personal details are not shared with other participants. Meetini uses safety and privacy authentications that more than satisfy the likes of Google/Microsoft's requirements."
  },
  {
    question: "Can I customize meeting preferences?",
    answer: "Yes, you can set preferences like time of day, meeting duration, and location type (e.g., coffee shop, office, or virtual)."
  },
  {
    question: "What happens if someone declines the meeting?",
    answer: "Meetini will automatically adjust and propose alternative options to accommodate changes in availability."
  },
  {
    question: "Does Meetini integrate with my calendar app?",
    answer: "Yes, Meetini integrates seamlessly with popular calendar apps like Google Calendar, Outlook, and Apple Calendar."
  },
  {
    question: "Can I invite people who don't use Meetini?",
    answer: "Of course! You can send invites via email or text. Non-users can still view and respond to meeting proposals if they choose not to sign up."
  },
  {
    question: "Is Meetini free to use?",
    answer: "For now Meetini is free for everyone. Eventually, Meetini will offer a free-tier with core functionality and advanced features will be available through premium subscriptions (pricing to be determined)."
  },
  {
    question: "How do I get started with Meetini?",
    answer: "Simply click the invitation link (either in email or via SMS) and click Sign Up or try sending invitations. The process will get your details necessary for sign up. Alternatively, you can download the web app, grant calendar access, and follow the prompts to set up your profile. You'll be scheduling smarter in no time!"
  },
  {
    question: "What if I need help or support?",
    answer: "Our support team is here to assist you. Contact us through the app or visit our website for FAQs and tutorials."
  },
  {
    question: "Can Meetini handle time zone differences?",
    answer: "Yes, Meetini automatically adjusts for time zones when scheduling global meetings."
  }
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32">
        <div className="mt-16">
          <div className="flex justify-center mb-16">
            <Image
              src="/logos/motto1.png"
              alt="Meetini Motto"
              width={500}
              height={125}
              className="w-auto h-auto"
              priority
            />
          </div>
          <h1 className="text-4xl font-bold text-center mb-12">Frequently Asked Questions</h1>
          <div className="space-y-8">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-gray-900 rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-4">{faq.question}</h3>
                <p className="text-gray-300">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 