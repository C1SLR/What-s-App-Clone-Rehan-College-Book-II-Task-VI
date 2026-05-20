/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import Login from './components/Login';
import { ChatPreview } from './types';

function MainApp() {
  const { user } = useAuth();
  const [activeChat, setActiveChat] = useState<ChatPreview | null>(null);

  if (!user) {
    return <Login />;
  }

  return (
    <div className="h-screen bg-[#0b141a] flex items-center justify-center overflow-hidden">
      {/* Outer container to mimic WhatsApp Web desktop feel */}
      <div className="w-full h-full md:w-[calc(100%-40px)] md:h-[calc(100%-40px)] bg-[#111b21] shadow-2xl flex flex-col md:flex-row max-w-[1600px] mx-auto overflow-hidden border border-[#2f3b43]">
        <Sidebar 
          onSelectChat={setActiveChat} 
          activeChatId={activeChat?.id} 
        />
        <ChatWindow 
          activeChat={activeChat} 
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
