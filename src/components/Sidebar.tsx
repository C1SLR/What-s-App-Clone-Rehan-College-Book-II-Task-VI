import React, { useState, useEffect } from 'react';
import { Search, MoreVertical, MessageSquare, User, LogOut, MessageCircle, Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ChatPreview } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  onSelectChat: (chat: ChatPreview) => void;
  activeChatId?: string;
}

export default function Sidebar({ onSelectChat, activeChatId }: SidebarProps) {
  const { user, token, logout, socket } = useAuth();
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  // Fetch Contacts
  const fetchContacts = () => {
    if (!token) return;
    
    fetch('/api/contacts', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(setChats)
    .catch(console.error);
  };

  useEffect(() => {
    fetchContacts();

    // Listen for new messages to update the last message preview
    if (socket) {
      const handleMessageUpdate = () => {
        fetchContacts();
      };
      socket.on('receive_message', handleMessageUpdate);
      socket.on('message_sent', handleMessageUpdate);
      socket.on('message_edited', handleMessageUpdate);
      socket.on('message_deleted', handleMessageUpdate);
      
      return () => {
        socket.off('receive_message', handleMessageUpdate);
        socket.off('message_sent', handleMessageUpdate);
        socket.off('message_edited', handleMessageUpdate);
        socket.off('message_deleted', handleMessageUpdate);
      };
    }
  }, [token, socket]);

  // Listen for Typing Status
  useEffect(() => {
    if (!socket) return;

    const handleTyping = (data: { senderId: string; isTyping: boolean }) => {
      setTypingUsers(prev => ({
        ...prev,
        [data.senderId]: data.isTyping
      }));
    };

    socket.on('typing_status', handleTyping);
    return () => {
      socket.off('typing_status', handleTyping);
    };
  }, [socket]);

  const filteredChats = chats.filter(chat => 
    chat.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full md:w-[400px] border-r border-[#2f3b43] flex flex-col h-full bg-[#111b21]">
      {/* Header */}
      <div className="bg-[#202c33] px-4 py-2 flex justify-between items-center h-[60px] shrink-0">
        <div className="flex items-center gap-3">
           {user?.avatar ? (
            <img src={user.avatar} className="w-10 h-10 rounded-full border border-[#2f3b43]" alt="profile" />
           ) : (
            <div className="w-10 h-10 bg-[#6a7175] rounded-full flex items-center justify-center border border-[#2f3b43]">
              <User className="text-[#aebac1]" />
            </div>
           )}
           <span className="font-medium text-[#e9edef] hidden sm:block truncate max-w-[120px]">{user?.username}</span>
        </div>
        <div className="flex items-center gap-2 text-[#aebac1]">
          <button className="hover:bg-white/5 p-2 rounded-full text-[#aebac1] hover:text-[#e9edef] transition-colors" title="New Chat"><MessageCircle size={20} /></button>
          <button onClick={logout} className="hover:bg-white/5 p-2 rounded-full text-[#aebac1] hover:text-red-400 transition-colors" title="Logout"><LogOut size={20} /></button>
          <button className="hover:bg-white/5 p-2 rounded-full text-[#aebac1] hover:text-[#e9edef] transition-colors"><MoreVertical size={20} /></button>
        </div>
      </div>

      {/* Search */}
      <div className="p-2 shrink-0">
        <div className="bg-[#202c33] rounded-lg flex items-center px-3 py-1.5 ">
          <Search size={18} className="text-[#8696a0]" />
          <input 
            type="text" 
            placeholder="Search or start new chat" 
            className="bg-transparent border-none focus:outline-none w-full ml-4 text-sm text-[#e9edef] placeholder-[#8696a0]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredChats.map(chat => {
          const isTyping = typingUsers[chat.id];
          const isSelected = activeChatId === chat.id;

          return (
            <div 
              key={chat.id} 
              onClick={() => onSelectChat(chat)}
              className={cn(
                "flex items-center px-4 py-3 cursor-pointer hover:bg-[#202c33] transition-colors relative group border-b border-[#202c33]/40",
                isSelected && "bg-[#2a3942] hover:bg-[#2a3942]"
              )}
            >
              {/* Avatar with Bot overlay if bot */}
              <div className="relative shrink-0">
                <img src={chat.avatar} className="w-12 h-12 rounded-full border border-[#2f3b43]" alt={chat.username} />
                {chat.isBot && (
                  <span className="absolute -bottom-1 -right-1 bg-[#00a884] text-[#111b21] p-0.5 rounded-full border-2 border-[#111b21]" title="AI Chatbot">
                    <Bot size={12} fill="#111b21" />
                  </span>
                )}
              </div>

              <div className="ml-4 flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-normal text-[#e9edef] truncate">{chat.username}</span>
                    {chat.isBot && (
                      <span className="bg-[#00a884]/10 text-[#00a884] text-[10px] px-1.5 py-0.5 rounded font-medium border border-[#00a884]/20 uppercase tracking-wider scale-[0.9]">AI</span>
                    )}
                  </div>
                  <span className="text-[12px] text-[#8696a0] shrink-0">
                    {chat.lastMessage ? new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                
                <div className="flex justify-between items-center mt-1">
                  {isTyping ? (
                    <span className="text-sm font-medium text-[#00a884] animate-pulse">
                      typing...
                    </span>
                  ) : (
                    <span className={cn(
                      "text-sm text-[#8696a0] truncate max-w-[240px]",
                      chat.lastMessage?.isDeleted && "text-[#8696a0]/70 italic font-light"
                    )}>
                      {chat.lastMessage ? (
                        chat.lastMessage.isDeleted ? (
                          "🚫 This message was deleted"
                        ) : (
                          chat.lastMessage.content
                        )
                      ) : (
                        chat.botBio || 'Start a conversation'
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filteredChats.length === 0 && (
          <div className="p-8 text-center text-[#8696a0] text-sm">
            No contacts found
          </div>
        )}
      </div>
    </div>
  );
}
