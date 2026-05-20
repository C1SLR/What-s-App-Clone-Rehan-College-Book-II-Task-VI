import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MoreVertical, Search, Check, CheckCheck, Trash2, Edit2, Reply, X, ChevronDown, SmilePlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ChatPreview, Message } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ChatWindowProps {
  activeChat: ChatPreview | null;
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ChatWindow({ activeChat }: ChatWindowProps) {
  const { user, token, socket } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  
  // Feature states
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeReplyTarget, setActiveReplyTarget] = useState<Message | null>(null);
  const [activeEditTarget, setActiveEditTarget] = useState<Message | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isBotTyping, setIsBotTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const reactionPickerRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Reset states on chat switch
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setActiveReplyTarget(null);
    setActiveEditTarget(null);
    setActiveDropdownId(null);
    setActiveReactionPickerId(null);
    setIsBotTyping(false);
    setMessages([]);
  }, [activeChat]);

  // Fetch and Sync Messages
  useEffect(() => {
    if (!activeChat || !token) return;

    const fetchMessages = () => {
      fetch(`/api/messages/${activeChat.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(setMessages)
      .catch(console.error);
    };

    fetchMessages();

    // Polling fallback in case WebSockets are unavailable (e.g. Vercel serverless)
    const pollInterval = setInterval(() => {
      if (!socket || !socket.connected) {
        fetchMessages();
      }
    }, 3000);

    // Listen for socket events
    if (socket) {
      const handleReceive = (msg: Message) => {
        if (msg.senderId === activeChat.id || msg.receiverId === activeChat.id) {
          setMessages(prev => {
            // Prevent duplicate message renders
            if (prev.some(m => m.id === msg.id)) {
              return prev.map(m => m.id === msg.id ? msg : m);
            }
            return [...prev, msg];
          });
        }
      };

      const handleEdit = (updatedMsg: Message) => {
        if (updatedMsg.senderId === activeChat.id || updatedMsg.receiverId === activeChat.id) {
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
        }
      };

      const handleDelete = (updatedMsg: Message) => {
        if (updatedMsg.senderId === activeChat.id || updatedMsg.receiverId === activeChat.id) {
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
        }
      };

      const handleReaction = (updatedMsg: Message) => {
        if (updatedMsg.senderId === activeChat.id || updatedMsg.receiverId === activeChat.id) {
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
        }
      };

      const handleTyping = (data: { senderId: string; isTyping: boolean }) => {
        if (data.senderId === activeChat.id) {
          setIsBotTyping(data.isTyping);
        }
      };

      socket.on('receive_message', handleReceive);
      socket.on('message_sent', handleReceive);
      socket.on('message_edited', handleEdit);
      socket.on('message_deleted', handleDelete);
      socket.on('message_reacted', handleReaction);
      socket.on('typing_status', handleTyping);
      
      return () => {
        clearInterval(pollInterval);
        socket.off('receive_message', handleReceive);
        socket.off('message_sent', handleReceive);
        socket.off('message_edited', handleEdit);
        socket.off('message_deleted', handleDelete);
        socket.off('message_reacted', handleReaction);
        socket.off('typing_status', handleTyping);
      };
    }

    return () => {
      clearInterval(pollInterval);
    };
  }, [activeChat, token, socket]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdownId(null);
      }
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setActiveReactionPickerId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Smooth scroll to bottom when new messages arrive or bot is typing
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBotTyping]);

  // Handle typing input and trigger "typing..." socket events
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!socket || !activeChat || !socket.connected) return;

    socket.emit('typing_status', { receiverId: activeChat.id, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_status', { receiverId: activeChat.id, isTyping: false });
    }, 1500);
  };

  // Send Message (Normal, Reply, or Edit)
  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !activeChat || !socket) return;

    // Emit stop typing
    if (socket?.connected) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit('typing_status', { receiverId: activeChat.id, isTyping: false });
    }

    const token = localStorage.getItem('token');

    if (activeEditTarget) {
      // Edit Mode
      if (socket?.connected) {
        socket.emit('edit_message', {
          messageId: activeEditTarget.id,
          newContent: inputValue
        });
      } else {
        fetch(`/api/messages/${activeEditTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ newContent: inputValue })
        });
      }
      setActiveEditTarget(null);
    } else {
      // Normal / Reply Mode
      if (socket?.connected) {
        socket.emit('send_message', {
          receiverId: activeChat.id,
          content: inputValue,
          replyToId: activeReplyTarget?.id
        });
      } else {
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ receiverId: activeChat.id, content: inputValue, replyToId: activeReplyTarget?.id })
        });
      }
      setActiveReplyTarget(null);
    }

    setInputValue('');
  };

  // Delete message
  const handleDeleteMessage = (messageId: string) => {
    if (socket?.connected) {
      socket.emit('delete_message', { messageId });
    } else {
      const token = localStorage.getItem('token');
      fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    setActiveDropdownId(null);
  };

  // React to message
  const handleReactMessage = (messageId: string, emoji: string) => {
    if (socket?.connected) {
      socket.emit('react_message', { messageId, emoji });
    } else {
      const token = localStorage.getItem('token');
      fetch(`/api/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji })
      });
    }
    setActiveReactionPickerId(null);
    setActiveDropdownId(null);
  };

  // Set message to Reply Target
  const handleSetReply = (msg: Message) => {
    setActiveReplyTarget(msg);
    setActiveEditTarget(null);
    setInputValue('');
    setActiveDropdownId(null);
  };

  // Set message to Edit Target
  const handleSetEdit = (msg: Message) => {
    setActiveEditTarget(msg);
    setActiveReplyTarget(null);
    setInputValue(msg.content);
    setActiveDropdownId(null);
  };

  // Scroll to original replied-to message inside chat
  const scrollToMessage = (id: string) => {
    const el = messageRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-[#00a884]/20');
      setTimeout(() => {
        el.classList.remove('bg-[#00a884]/20');
      }, 1200);
    }
  };

  // Filter messages based on chat search query
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => !m.isDeleted && m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  if (!activeChat) {
    return (
      <div className="flex-1 bg-[#222e35] flex flex-col items-center justify-center border-b-[6px] border-[#00a884] relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#00a884 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
        <div className="flex flex-col items-center max-w-md text-center z-10 p-6">
          <div className="w-16 h-16 bg-[#00a884] rounded-full flex items-center justify-center mb-6 opacity-80 shadow-md">
            <Send className="text-[#111b21] rotate-[-30deg]" size={32} />
          </div>
          <h1 className="text-3xl font-light text-[#e9edef] mb-4">WhatsApp Web</h1>
          <p className="text-sm text-[#8696a0] leading-relaxed">
            Send and receive messages with your friends, or chat directly with our pre-loaded smart AI bots (Gemini AI, Claude AI, ChatGPT) to test their intelligence instantly! ⚡
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0b141a] relative overflow-hidden h-full">
      {/* Wallpaper Layer */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#00a884 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>

      {/* Header */}
      <div className="bg-[#202c33] px-4 py-2 flex justify-between items-center h-[60px] z-10 border-l border-[#2f3b43] shrink-0">
        <div className="flex items-center gap-3">
          <img src={activeChat.avatar} className="w-10 h-10 rounded-full border border-[#2f3b43]" alt="chat-profile" />
          <div className="min-w-0">
            <div className="font-normal text-[#e9edef] leading-tight flex items-center gap-1.5">
              <span className="truncate">{activeChat.username}</span>
              {activeChat.isBot && (
                <span className="bg-[#00a884]/15 text-[#00a884] text-[10px] px-1 rounded font-medium border border-[#00a884]/20 scale-90 uppercase">AI</span>
              )}
            </div>
            <div className="text-[12px] text-[#8696a0] truncate max-w-[200px]">
              {isBotTyping ? (
                <span className="text-[#00a884] font-medium animate-pulse">typing...</span>
              ) : (
                activeChat.isBot ? (
                  activeChat.botBio || "AI Bot"
                ) : (
                  "online"
                )
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[#aebac1]">
          <Search 
            size={20} 
            className={cn("cursor-pointer hover:text-[#e9edef] transition-colors", searchOpen && "text-[#00a884]")} 
            onClick={() => setSearchOpen(!searchOpen)} 
          />
          <MoreVertical size={20} className="cursor-pointer hover:text-[#e9edef] transition-colors" />
        </div>
      </div>

      {/* Embedded Chat Search Bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '48px', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#111b21] px-4 py-2 flex items-center border-b border-[#2f3b43] z-10 gap-3 shrink-0 overflow-hidden"
          >
            <div className="bg-[#202c33] rounded-lg flex items-center px-3 py-1 flex-1">
              <Search size={16} className="text-[#8696a0]" />
              <input 
                type="text" 
                placeholder="Search messages in this chat" 
                className="bg-transparent border-none focus:outline-none w-full ml-3 text-sm text-[#e9edef] placeholder-[#8696a0]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[#8696a0] hover:text-[#e9edef]">
                  <X size={16} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-4 space-y-3 z-10 custom-scrollbar">
        {filteredMessages.map((msg) => {
          const isMe = msg.senderId === user?.id;
          const replyMsg = messages.find(m => m.id === msg.replyToId);
          
          return (
            <div
              key={msg.id}
              ref={el => { messageRefs.current[msg.id] = el; }}
              className={cn(
                "flex mb-1 transition-all duration-300 rounded px-2 py-0.5",
                isMe ? "justify-end" : "justify-start"
              )}
            >
              <div 
                className={cn(
                  "max-w-[70%] md:max-w-[60%] px-3 py-1.5 rounded-lg shadow-sm text-[14.2px] relative group border",
                  isMe 
                    ? "bg-[#005c4b] text-[#e9edef] rounded-tr-none border-[#025041]" 
                    : "bg-[#202c33] text-[#e9edef] rounded-tl-none border-[#2b3941]"
                )}
              >
                {/* Replying-to Preview box inside bubble */}
                {replyMsg && (
                  <div 
                    onClick={() => scrollToMessage(replyMsg.id)}
                    className="bg-black/15 border-l-4 border-[#00a884] p-2 rounded mb-2 text-xs cursor-pointer hover:bg-black/25 transition-all text-[#8696a0]"
                  >
                    <div className="font-semibold text-[#e9edef] text-[11px] mb-0.5">
                      {replyMsg.senderId === user?.id ? "You" : activeChat.username}
                    </div>
                    <div className="truncate max-w-[250px]">
                      {replyMsg.isDeleted ? "🚫 This message was deleted" : replyMsg.content}
                    </div>
                  </div>
                )}

                {/* Message Dropdown Chevron */}
                {!msg.isDeleted && (
                  <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button 
                      onClick={() => setActiveDropdownId(activeDropdownId === msg.id ? null : msg.id)}
                      className="bg-black/20 text-[#aebac1] hover:text-[#e9edef] rounded p-0.5 transition-colors"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}

                {/* Dropdown Options */}
                {activeDropdownId === msg.id && (
                  <div 
                    ref={dropdownRef}
                    className={cn(
                      "absolute bg-[#233138] border border-[#2f3b43] rounded shadow-xl py-1.5 z-30 w-32 text-xs",
                      isMe ? "right-1.5 top-7" : "left-1.5 top-7"
                    )}
                  >
                    <button 
                      onClick={() => handleSetReply(msg)}
                      className="flex items-center gap-2 px-3 py-2 w-full text-left text-[#e9edef] hover:bg-[#182229] transition-colors"
                    >
                      <Reply size={13} className="text-[#8696a0]" /> Reply
                    </button>
                    
                    <button 
                      onClick={() => setActiveReactionPickerId(msg.id)}
                      className="flex items-center gap-2 px-3 py-2 w-full text-left text-[#e9edef] hover:bg-[#182229] transition-colors"
                    >
                      <SmilePlus size={13} className="text-[#8696a0]" /> React
                    </button>

                    {isMe && (
                      <>
                        <button 
                          onClick={() => handleSetEdit(msg)}
                          className="flex items-center gap-2 px-3 py-2 w-full text-left text-[#e9edef] hover:bg-[#182229] transition-colors"
                        >
                          <Edit2 size={13} className="text-[#8696a0]" /> Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="flex items-center gap-2 px-3 py-2 w-full text-left text-red-400 hover:bg-[#182229] transition-colors border-t border-[#2f3b43]/30 mt-1 pt-1.5"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Reaction Picker floating overlay */}
                {activeReactionPickerId === msg.id && (
                  <div 
                    ref={reactionPickerRef}
                    className={cn(
                      "absolute bg-[#233138] border border-[#2f3b43] rounded-full shadow-2xl px-2 py-1.5 z-30 flex gap-2.5",
                      isMe ? "-top-10 right-0" : "-top-10 left-0"
                    )}
                  >
                    {EMOJIS.map((emoji) => (
                      <button 
                        key={emoji}
                        onClick={() => handleReactMessage(msg.id, emoji)}
                        className="hover:scale-130 transition-transform active:scale-95 text-base"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Message Content */}
                <p className={cn(
                  "leading-relaxed break-words whitespace-pre-wrap pr-4",
                  msg.isDeleted && "italic text-[#8696a0]/70 font-light pr-0"
                )}>
                  {msg.content}
                </p>

                {/* Footer (Edited, Timestamp, Checkmarks, Reactions) */}
                <div className="flex justify-end items-end gap-1 mt-1 shrink-0 select-none">
                  {msg.isEdited && !msg.isDeleted && (
                    <span className="text-[10px] text-[#8696a0]/70 italic">edited</span>
                  )}
                  <span className="text-[10px] text-[#8696a0] font-light">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    <span className="text-[#53bdeb]">
                      <CheckCheck size={14} />
                    </span>
                  )}
                </div>

                {/* Emoji Reactions display under bubble */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div 
                    className={cn(
                      "absolute -bottom-2.5 bg-[#233138] border border-[#2f3b43] rounded-full px-1.5 py-0.5 flex items-center gap-1 shadow-sm text-xs z-10",
                      isMe ? "right-2" : "left-2"
                    )}
                  >
                    <div className="flex gap-0.5">
                      {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => (
                        <span key={emoji} className="text-[11px]">{emoji}</span>
                      ))}
                    </div>
                    {msg.reactions.length > 1 && (
                      <span className="text-[9px] text-[#8696a0] font-medium px-0.5">{msg.reactions.length}</span>
                    )}
                  </div>
                )}

              </div>
            </div>
          );
        })}

        {/* Real-time Bot Typing Indicator in Message pane */}
        {isBotTyping && (
          <div className="flex justify-start mb-2">
            <div className="bg-[#202c33] text-[#e9edef] px-4 py-2.5 rounded-lg rounded-tl-none border border-[#2b3941] shadow-sm flex items-center gap-1.5">
              <span className="text-xs text-[#8696a0] mr-1">{activeChat.username} is typing</span>
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Action Panels (Reply or Edit indicators) */}
      <div className="z-10 shrink-0">
        
        {/* Threaded Reply preview indicator panel */}
        {activeReplyTarget && (
          <div className="bg-[#1f2c34] border-l-[4px] border-[#00a884] px-4 py-2.5 flex justify-between items-center text-xs animate-slide-up">
            <div className="min-w-0">
              <div className="font-semibold text-[#00a884] mb-0.5">
                Replying to {activeReplyTarget.senderId === user?.id ? "You" : activeChat.username}
              </div>
              <div className="text-[#8696a0] truncate pr-4 max-w-[500px]">
                {activeReplyTarget.content}
              </div>
            </div>
            <button 
              onClick={() => setActiveReplyTarget(null)}
              className="text-[#8696a0] hover:text-[#e9edef] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Edit message preview indicator panel */}
        {activeEditTarget && (
          <div className="bg-[#1f2c34] border-l-[4px] border-[#ffb900] px-4 py-2.5 flex justify-between items-center text-xs animate-slide-up">
            <div className="min-w-0">
              <div className="font-semibold text-[#ffb900] mb-0.5">Editing message</div>
              <div className="text-[#8696a0] truncate pr-4 max-w-[500px]">
                {activeEditTarget.content}
              </div>
            </div>
            <button 
              onClick={() => {
                setActiveEditTarget(null);
                setInputValue('');
              }}
              className="text-[#8696a0] hover:text-[#e9edef] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="bg-[#202c33] px-4 py-2.5 flex items-center gap-4 border-l border-[#2f3b43]">
          <Smile size={26} className="text-[#8696a0] cursor-pointer hover:text-[#d1d7db] transition-colors" />
          <Paperclip size={26} className="text-[#8696a0] cursor-pointer hover:text-[#d1d7db] transition-colors" />
          <form onSubmit={handleSendMessage} className="flex-1">
            <input 
              type="text" 
              placeholder={activeEditTarget ? "Edit message..." : "Type a message"} 
              className="w-full bg-[#2a3942] rounded-lg px-4 py-2.5 focus:outline-none text-sm text-[#e9edef] placeholder-[#8696a0]"
              value={inputValue}
              onChange={handleInputChange}
            />
          </form>
          {inputValue.trim() ? (
            <button onClick={() => handleSendMessage()} className="text-[#00a884] hover:text-[#00d0a5] transition-colors"><Send size={26} /></button>
          ) : (
            <div className="w-[26px]"></div>
          )}
        </div>
      </div>
    </div>
  );
}
