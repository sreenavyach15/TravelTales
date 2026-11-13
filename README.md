# ✈️ Travel Tales - Your Smart Travel Companion
### Plan Together. Travel Better.

**Travel Tales** is an AI-powered travel companion web application that simplifies trip planning and enhances travel experiences through intelligent itinerary generation, collaborative trip management, real-time communication, expense tracking, and memory preservation.

The platform brings all essential travel activities together in one place, making travelling more organized, convenient, and enjoyable.

## ✨ Features & Functionalities

### 1. AI-Powered Trip Planning
- Generate personalized, day-wise travel itineraries using Google Gemini AI.
- Customize plans based on destination, duration, budget, and interests.
- Consider hotel-stay budgets, daily expenditure, travel mode, distance, and travel time.
- Incorporate food preferences, group type, activities, and rest periods.
- Receive personalized travel recommendations.

### 2. Trip & Group Management
- Create, organize, and manage trips.
- Invite friends and add travel companions.
- Maintain trip details, destinations, dates, and itineraries.
- Enable collaborative trip planning.

### 3. Real-Time Group Chat
- Dedicated chat for each trip.
- Communicate with fellow travellers.
- Share travel-related updates and coordinate plans.
- Firebase-powered messaging.

### 4. Shared Expense Management
- Record and manage trip expenses.
- Track individual contributions.
- Maintain shared expenditure records.
- Organize group travel budgets.

### 5. Digital Travel Diary
- Document travel experiences and memorable moments.
- Create personal travel entries.
- Preserve trip-related memories in one place.

### 6. Shared Photo Albums
- Upload and organize travel photographs.
- Create trip-specific photo collections.
- Share memories with fellow travellers.
- Store images using Supabase Storage.

### 7. Responsive UI & Themes
- Mobile-first, responsive interface.
- Supports desktop, tablet, and mobile devices.
- Light and dark themes.
- Modern, intuitive design with consistent navigation and reusable components.

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React.js, HTML5, CSS3, JavaScript |
| Build Tool | Vite |
| Authentication | Firebase Authentication |
| Database | Firebase Firestore |
| Real-Time Chat | Firebase |
| Image Storage | Supabase Storage |
| AI Integration | Google Gemini API |
| Version Control | Git, GitHub |

## ⚙️ Installation & Setup

**1. Clone the repository**

```bash
git clone <YOUR_REPOSITORY_URL>
cd travel-tales
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment variables**

Create a `.env` file in the project root and configure the required Firebase, Gemini, and Supabase credentials.

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

VITE_GEMINI_API_KEY=your_gemini_api_key

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**4. Run the application**

```bash
npm run dev
```

Open the local URL provided by Vite (typically `http://localhost:5173`) in your browser.

## 🔮 Future Enhancements
- Interactive maps and route visualization.
- Live weather updates and destination insights.
- Automated expense splitting and settlement.
- Offline itinerary access.
- Advanced AI-based recommendations.
- Hotel and transportation booking integration.

## 🎯 Project Objective

Travel Tales aims to create a unified travel ecosystem where users can **plan smarter, travel together, manage expenses effortlessly, and preserve unforgettable memories**.

**Project Domain:** Travel Technology / AI-powered Travel Planning  
**Project Type:** Full-Stack Web Application

---

*Travel Tales — Every Journey Has a Story.*
