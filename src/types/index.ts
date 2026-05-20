export interface User {
  id: string;
  username: string;
  avatar?: string;
  lastSeen?: Date;
  isBot?: boolean;
  botBio?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
  isEdited?: boolean;
  isDeleted?: boolean;
  replyToId?: string;
  reactions?: { userId: string; username: string; emoji: string }[];
}

export interface ChatPreview {
  id: string;
  username: string;
  avatar?: string;
  lastMessage?: Message | null;
  unreadCount?: number;
  isBot?: boolean;
  botBio?: string;
  lastSeen?: Date;
}
