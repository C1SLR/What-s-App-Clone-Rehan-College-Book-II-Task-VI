import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'motion/react';
import { MessageSquare } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      login(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b141a] flex flex-col items-center pt-24 px-4 overflow-hidden relative">
      <div className="bg-[#00a884] h-[220px] w-full absolute top-0 left-0 z-0 opacity-80 shadow-lg"></div>
      
      <div className="z-10 w-full max-w-[450px]">
        <div className="flex items-center gap-3 mb-12 ml-4">
          <div className="bg-[#111b21] p-2 rounded-xl shadow-md border border-[#2f3b43]">
            <MessageSquare className="text-[#00a884]" size={36} fill="#00a884" fillOpacity={0.2} />
          </div>
          <span className="text-[#e9edef] text-3xl font-medium tracking-tight">WhatsApp Clone</span>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111b21] p-10 rounded-xl shadow-2xl border border-[#2f3b43]"
        >
          <h2 className="text-2xl font-light text-[#e9edef] mb-8">{isLogin ? 'Login' : 'Sign Up'}</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-[#00a884] uppercase mb-2">Username</label>
              <input 
                type="text" 
                required
                className="w-full bg-transparent border-b-2 border-[#2f3b43] focus:border-[#00a884] outline-none py-2 px-1 transition-all text-[#e9edef]"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#00a884] uppercase mb-2">Password</label>
              <input 
                type="password" 
                required
                className="w-full bg-transparent border-b-2 border-[#2f3b43] focus:border-[#00a884] outline-none py-2 px-1 transition-all text-[#e9edef]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#00a884] text-[#111b21] py-3 rounded-lg font-bold shadow-lg hover:bg-[#00d0a5] transition-all active:scale-[0.98] mt-4 disabled:opacity-50"
            >
              {loading ? 'Processing...' : (isLogin ? 'LOG IN' : 'SIGN UP')}
            </button>
          </form>

          <p className="text-center text-sm text-[#8696a0] mt-8">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="text-[#00a884] font-semibold hover:underline"
            >
              {isLogin ? 'Register now' : 'Log in here'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
