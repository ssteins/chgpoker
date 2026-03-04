# 🃏 Pointing Poker Application

A real-time planning poker application built with React, Node.js, and TypeScript for agile development teams to estimate user stories using Fibonacci numbers and other voting scales.

## ✨ Features

- **Real-time Voting**: See when team members vote without revealing estimates
- **Multiple Voting Scales**: Fibonacci, Simple (1-5), Linear (1-10), Even/Odd numbers, and custom values
- **Room Management**: Create rooms, manage participants, and control voting sessions
- **Vote Statistics**: Automatic calculation of averages and nearest Fibonacci numbers
- **Apple-like Design**: Clean, modern, and responsive user interface
- **Server-Sent Events**: Real-time updates without WebSocket complexity
- **No Database**: In-memory storage for simplicity
- **Timer Support**: Set time limits for voting sessions (ready for implementation)
- **Owner Controls**: Room creators can start voting, reveal votes, and manage sessions

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone or download the project
2. Install dependencies:
   ```bash
   npm install
   ```

3. **Configure Okta (Optional)**:
   - Copy `.env.example` to `.env`
   - Update with your Okta Developer app settings:
     ```bash
     VITE_OKTA_ISSUER=https://dev-12345.okta.com/oauth2/default
     VITE_OKTA_CLIENT_ID=your-client-id-here
     ```

4. Start the development servers:
   ```bash
   npm run dev
   ```

This will start both the backend server (port 3001) and frontend development server (port 5173).

## 🛠️ Development Scripts

```bash
# Start both backend and frontend
npm run dev

# Start only backend
npm run dev:backend

# Start only frontend  
npm run dev:frontend

# Build frontend for production
npm run build:frontend

# Build backend for production
npm run build:backend
```

## 📁 Project Structure

```
hackathon2026.02/
├── backend/                 # Node.js Express server
│   ├── src/
│   │   └── server.ts       # Main server file with API endpoints
│   ├── package.json        # Backend dependencies
│   └── tsconfig.json       # TypeScript configuration
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   │   ├── HomePage.tsx    # Room creation page
│   │   │   ├── JoinPage.tsx    # Room joining page
│   │   │   └── RoomPage.tsx    # Main poker room interface
│   │   ├── App.tsx        # Main app component
│   │   └── main.tsx       # React entry point
│   ├── package.json       # Frontend dependencies
│   └── vite.config.ts     # Vite configuration
├── shared/                # Shared TypeScript types
│   └── types.ts          # Common interfaces and types
└── package.json          # Root package.json for scripts
```

## 🎮 How to Use

1. **Create a Room**: 
   - Enter your name as room owner
   - Set room title and description
   - Choose voting scale (Fibonacci, Linear, Custom, etc.)
   - Click "Create Room"

2. **Invite Team Members**:
   - Share the room link with your team
   - Team members can join by entering their name

3. **Estimate Stories**:
   - Room owner can edit the current story details
   - Start a voting session
   - Team members select their estimates
   - Reveal votes to see results and statistics

4. **Repeat Process**:
   - Start new voting rounds for additional stories
   - View voting history and statistics

## � Okta Authentication (Optional)

The application supports optional Okta authentication for enterprise environments. When configured, only users with `@chghealthcare.com` email addresses can create rooms.

### Setup Okta Developer Account

1. **Visit [developer.okta.com](https://developer.okta.com)** and sign up with your `@chghealthcare.com` email
2. **Create Application**:
   - Choose "Single-Page App (SPA)"
   - Set application name: "Pointing Poker"
   - Set redirect URIs:
     ```
     http://localhost:5173/login/callback
     http://localhost:5173
     ```
   - Set logout redirect URIs:
     ```
     http://localhost:5173
     ```

3. **Configure Settings**:
   - Enable Authorization Code with PKCE
   - Disable Implicit grant type
   - Add Trusted Origins for CORS:
     ```
     http://localhost:5173 - CORS + Redirect
     ```

4. **Get Configuration Values**:
   - Note your **Client ID**
   - Note your **Issuer URL** (e.g., `https://dev-12345.okta.com/oauth2/default`)

5. **Environment Configuration**:
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env with your values
   VITE_OKTA_ISSUER=https://dev-12345.okta.com/oauth2/default
   VITE_OKTA_CLIENT_ID=your-client-id-here
   ```

### Authentication Behavior

- **Home Page**: Requires authentication to create rooms
- **Join/Play Pages**: Allow guest access to preserve sharing functionality
- **User Info**: Authenticated users see email and sign-out option
- **Domain Restriction**: Only `@chghealthcare.com` emails are allowed
- **Graceful Fallback**: App works without authentication if Okta is not configured

### Production Setup

For production deployment:
1. Add production redirect URIs to your Okta app
2. Update environment variables with production URLs
3. Optionally enable JWT signature verification in backend

## �🔧 Technical Details

### Backend (Port 3001)
- **Framework**: Express.js with TypeScript
- **Real-time**: Server-Sent Events (SSE)
- **Storage**: In-memory (no database required)
- **API Endpoints**:
  - `POST /api/rooms` - Create new room
  - `GET /api/rooms/:roomId` - Get room details
  - `POST /api/rooms/:roomId/join` - Join room
  - `POST /api/rooms/:roomId/vote` - Cast vote
  - `POST /api/rooms/:roomId/start-voting` - Start voting session
  - `POST /api/rooms/:roomId/reveal` - Reveal votes
  - `GET /api/rooms/:roomId/events` - SSE endpoint for real-time updates

### Frontend (Port 5173)
- **Framework**: React 18 with TypeScript
- **Routing**: React Router DOM
- **Styling**: CSS with Apple-inspired design system
- **Build Tool**: Vite
- **Real-time**: EventSource for SSE consumption

### Shared Types
- **Room**: Room structure with users, voting state, and settings
- **User**: User information and voting status
- **VoteStats**: Voting statistics and analysis
- **SSE Events**: Real-time event definitions

## 🎨 Design System

The application uses an Apple-inspired design system with:
- Clean typography and spacing
- Subtle shadows and borders
- Responsive grid layout
- Smooth animations and transitions
- Consistent color palette
- Mobile-friendly responsive design

## 🔮 Future Enhancements

- [ ] Timer functionality for voting sessions
- [ ] Vote history and session analytics
- [ ] User avatars and profiles
- [ ] Persistent storage option
- [ ] Export voting results
- [ ] Integration with Jira/GitHub
- [ ] Multiple simultaneous stories
- [ ] Spectator mode
- [ ] Emoji reactions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🆘 Troubleshooting

### Common Issues

**Port already in use**: Make sure no other applications are running on ports 3001 or 5173.

**Dependencies not installing**: Delete `node_modules` and `package-lock.json`, then run `npm install` again.

**TypeScript errors**: Make sure you're using Node.js v18+ and have TypeScript installed.

**Real-time features not working**: Check that the backend server is running and accessible at `http://localhost:3001`.

### Development Tips

- Use browser dev tools to monitor SSE connections
- Check the browser Network tab for API calls
- Backend logs will show in the terminal
- Use React DevTools for component debugging

## 👏 Acknowledgments

Built with modern web technologies for a smooth, real-time planning poker experience. Perfect for distributed agile teams who need reliable story estimation tools.