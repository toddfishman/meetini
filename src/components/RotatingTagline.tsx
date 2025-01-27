import React, { useState, useEffect } from 'react';

const taglines = [
  {
    title: "Coffee with Alex, Jane and Charles",
    description: "Effortlessly plan casual meetups with multiple people."
  },
  {
    title: "Weekly Team Sync, priority high",
    description: "Seamless scheduling for recurring meetings with the same people and make sure they are not scheduled over."
  },
  {
    title: "Dinner with Clients",
    description: "GPS and AI-powered location and timing for business or personal events."
  },
  {
    title: "Book Club Gathering",
    description: "Find the perfect time for group hobbies."
  },
  {
    title: "Zoom Catch-Up with Mom",
    description: "Easily coordinate virtual calls."
  },
  {
    title: "Game Night with Friends",
    description: "Optimize times for social events."
  },
  {
    title: "Find a date for our Fantasy Football draft that works for EVERYONE",
    description: "Instantly scheduling larger get togethers, when attendance is mandatory."
  },
  {
    title: "Weekend Hike with the Johnsons",
    description: "Plan activities with groups in seconds."
  },
  {
    title: "Surprise Party Prep",
    description: "Sync plans for special occasions while keeping the gist a surprise."
  },
  {
    title: "Cross-Timezone Brainstorm",
    description: "Handle global meetings effortlessly with one invitation."
  }
];

export default function RotatingTagline() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % taglines.length);
        setIsVisible(true);
      }, 500); // Wait for fade out before changing text
    }, 5000); // Change every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center transition-opacity duration-500 ease-in-out"
         style={{ opacity: isVisible ? 1 : 0 }}>
      <h1 className="text-2xl font-bold mb-2">
        "{taglines[currentIndex].title}"
      </h1>
      <p className="text-gray-400">
        {taglines[currentIndex].description}
      </p>
    </div>
  );
} 