/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, FormEvent, useEffect } from 'react';
import { Plus, User, DollarSign, ArrowUpRight, ArrowDownLeft, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UserData {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  name: string;
  amount: number;
  paidBy: string;
  splitAmong: string[];
  shares?: Record<string, number>; // Optional custom shares
  date: string;
  time: string;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [users, setUsers] = useState<UserData[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('1');

  // Fetch data from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersRes = await fetch('/api/users');
        const usersData = await usersRes.json();
        setUsers(usersData);

        const expensesRes = await fetch('/api/expenses');
        const expensesData = await expensesRes.json();
        setExpenses(expensesData);
      } catch (error) {
        console.error('Failed to fetch data from backend', error);
      }
    };
    fetchData();
  }, []);

  // Form states
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [selectedSplitUsers, setSelectedSplitUsers] = useState<string[]>([]);
  const [fixedShares, setFixedShares] = useState<Record<string, string>>({});

  const currentUser = useMemo(() => users.find(u => u.id === currentUserId), [users, currentUserId]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      
      if (response.ok) {
        const user = await response.json();
        setCurrentUserId(user.id);
        setIsLoggedIn(true);
        setLoginError('');
      } else {
        const errorData = await response.json();
        setLoginError(errorData.error || 'Invalid username or password (hint: use any user name and "password123")');
      }
    } catch (error) {
      console.error('Login failed', error);
      setLoginError('An error occurred during login. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginUsername('');
    setLoginPassword('');
  };

  const calculatedShares = useMemo((): Record<string, number> => {
    const total = parseFloat(expenseAmount || '0');
    if (isNaN(total) || selectedSplitUsers.length === 0) return {};

    const shares: Record<string, number> = {};
    const fixedUserIds = Object.keys(fixedShares).filter(id => selectedSplitUsers.includes(id));
    
    let fixedTotal = 0;
    fixedUserIds.forEach(id => {
      const val = parseFloat(fixedShares[id] || '0');
      fixedTotal += val;
      shares[id] = val;
    });

    const remainingAmount = total - fixedTotal;
    const autoUserIds = selectedSplitUsers.filter(id => !fixedUserIds.includes(id));

    if (autoUserIds.length > 0) {
      const autoShare = Math.max(0, remainingAmount / autoUserIds.length);
      autoUserIds.forEach(id => {
        shares[id] = autoShare;
      });
    }

    return shares;
  }, [expenseAmount, selectedSplitUsers, fixedShares]);

  const balances = useMemo(() => {
    const netBalances: Record<string, number> = {};
    
    // Initialize balances for all users except current
    users.forEach(u => {
      if (u.id !== currentUserId) {
        netBalances[u.id] = 0;
      }
    });

    expenses.forEach(expense => {
      if (expense.paidBy === currentUserId) {
        // Current user paid, others owe them
        expense.splitAmong.forEach(userId => {
          if (userId !== currentUserId) {
            const share = expense.shares?.[userId] ?? (expense.amount / expense.splitAmong.length);
            netBalances[userId] = (netBalances[userId] || 0) + share;
          }
        });
      } else if (expense.splitAmong.includes(currentUserId)) {
        // Someone else paid, current user owes them
        const paidBy = expense.paidBy;
        if (paidBy in netBalances) {
          const share = expense.shares?.[currentUserId] ?? (expense.amount / expense.splitAmong.length);
          netBalances[paidBy] = (netBalances[paidBy] || 0) - share;
        }
      }
    });

    return netBalances;
  }, [expenses, users, currentUserId]);

  const toGetFrom = Object.entries(balances).filter((entry): entry is [string, number] => (entry[1] as number) > 0);
  const toGiveTo = Object.entries(balances).filter((entry): entry is [string, number] => (entry[1] as number) < 0);

  const handleAddExpense = async () => {
    const totalAmount = parseFloat(expenseAmount);
    if (!expenseName.trim() || isNaN(totalAmount) || selectedSplitUsers.length === 0) return;

    // Final validation: sum of calculated shares should match total
    const sum = Object.keys(calculatedShares).reduce((acc, key) => acc + (calculatedShares[key] || 0), 0);
    if (Math.abs(sum - totalAmount) > 0.01) {
      alert(`The sum of shares ($${sum.toFixed(2)}) must equal the total amount ($${totalAmount.toFixed(2)}). Please adjust fixed amounts.`);
      return;
    }

    const now = new Date();
    const newExpense: Expense = {
      id: Math.random().toString(36).substr(2, 9),
      name: expenseName,
      amount: totalAmount,
      paidBy: currentUserId,
      splitAmong: selectedSplitUsers,
      shares: calculatedShares,
      date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };

    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense),
      });
      if (response.ok) {
        setExpenses([...expenses, newExpense]);
        setExpenseName('');
        setExpenseAmount('');
        setSelectedSplitUsers([]);
        setFixedShares({});
      }
    } catch (error) {
      console.error('Failed to save expense to backend', error);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedSplitUsers(prev => {
      const isSelected = prev.includes(userId);
      if (isSelected) {
        const next = prev.filter(id => id !== userId);
        const nextFixed = { ...fixedShares };
        delete nextFixed[userId];
        setFixedShares(nextFixed);
        return next;
      } else {
        return [...prev, userId];
      }
    });
  };

  const toggleFixedShare = (userId: string) => {
    setFixedShares(prev => {
      if (userId in prev) {
        const next = { ...prev };
        delete next[userId];
        return next;
      } else {
        // Initialize with current calculated share
        return { ...prev, [userId]: calculatedShares[userId]?.toFixed(2) || '0' };
      }
    });
  };

  const handleFixedShareChange = (userId: string, value: string) => {
    setFixedShares(prev => ({ ...prev, [userId]: value }));
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white border border-[#E5E5E5] rounded-3xl p-8 shadow-xl"
        >
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tighter mb-2 italic serif">Splitwiser</h1>
            <p className="text-[#8E9299] text-sm">Sign in to manage your expenses</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#8E9299] ml-1">Username</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full p-4 bg-[#F9F9F9] border border-[#E5E5E5] rounded-2xl focus:outline-none focus:border-[#F27D26] transition-colors"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#8E9299] ml-1">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-4 bg-[#F9F9F9] border border-[#E5E5E5] rounded-2xl focus:outline-none focus:border-[#F27D26] transition-colors"
                required
              />
            </div>

            {loginError && (
              <p className="text-[#F27D26] text-xs font-medium text-center">{loginError}</p>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-[#1A1A1A] text-white rounded-2xl font-bold hover:bg-black transition-colors shadow-lg"
            >
              Sign In
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-center border-b border-[#E5E5E5] pb-6">
          <h1 className="text-3xl font-bold tracking-tight">Splitwiser</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white border border-[#E5E5E5] px-4 py-2 rounded-2xl shadow-sm">
              <div className="w-8 h-8 bg-[#F27D26] rounded-full flex items-center justify-center text-white">
                <User size={18} />
              </div>
              <div className="text-sm">
                <p className="text-[#8E9299] text-[10px] uppercase font-bold tracking-wider">Logged in as</p>
                <p className="font-semibold">{currentUser?.name}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-[10px] uppercase font-bold text-[#8E9299] hover:text-[#F27D26] transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Balances Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* To Get From */}
          <div className="bg-white border border-[#E5E5E5] rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <ArrowDownLeft size={20} />
              </div>
              <h2 className="text-lg font-bold italic serif">to get from</h2>
            </div>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {toGetFrom.length > 0 ? (
                  toGetFrom.map(([userId, bal]) => (
                    <motion.div
                      key={userId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex justify-between items-center p-4 bg-[#F9F9F9] border border-[#E5E5E5] rounded-2xl hover:border-[#F27D26] transition-colors group"
                    >
                      <span className="font-medium">{users.find(u => u.id === userId)?.name}</span>
                      <span className="text-green-600 font-mono font-bold">${bal.toFixed(2)}</span>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-[#8E9299] text-sm italic py-4 text-center">No one owes you anything yet.</p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* To Give To */}
          <div className="bg-white border border-[#E5E5E5] rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-orange-50 text-[#F27D26] rounded-lg">
                <ArrowUpRight size={20} />
              </div>
              <h2 className="text-lg font-bold italic serif">to give to</h2>
            </div>
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {toGiveTo.length > 0 ? (
                  toGiveTo.map(([userId, bal]) => (
                    <motion.div
                      key={userId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex justify-between items-center p-4 bg-[#F9F9F9] border border-[#E5E5E5] rounded-2xl hover:border-[#F27D26] transition-colors group"
                    >
                      <span className="font-medium">{users.find(u => u.id === userId)?.name}</span>
                      <span className="text-[#F27D26] font-mono font-bold">${Math.abs(bal).toFixed(2)}</span>
                    </motion.div>
                  ))
                ) : (
                  <p className="text-[#8E9299] text-sm italic py-4 text-center">You don't owe anyone anything.</p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <hr className="border-[#E5E5E5]" />

        {/* Add Expense Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <DollarSign size={20} />
            </div>
            <h2 className="text-xl font-bold italic serif">add expense</h2>
          </div>
          
          <div className="bg-white border border-[#E5E5E5] rounded-3xl p-8 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#8E9299] ml-1">What for?</label>
                <input
                  type="text"
                  placeholder="expense name"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                  className="w-full p-4 bg-[#F9F9F9] border border-[#E5E5E5] rounded-2xl focus:outline-none focus:border-[#F27D26] transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-[#8E9299] ml-1">How much?</label>
                <input
                  type="number"
                  placeholder="amount"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full p-4 bg-[#F9F9F9] border border-[#E5E5E5] rounded-2xl focus:outline-none focus:border-[#F27D26] transition-colors font-mono"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <p className="text-xs font-bold uppercase tracking-widest text-[#8E9299]">Split among</p>
                <p className="text-[10px] text-[#8E9299] italic">Click a user to split, then click the lock to fix their amount</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {users.map(user => {
                  const isSelected = selectedSplitUsers.includes(user.id);
                  const isFixed = user.id in fixedShares;
                  const share = calculatedShares[user.id] || 0;

                  return (
                    <div key={user.id} className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleUserSelection(user.id)}
                          className={`flex-1 px-4 py-3 rounded-xl border transition-all text-sm font-medium flex justify-between items-center ${
                            isSelected
                              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                              : 'bg-white text-[#1A1A1A] border-[#E5E5E5] hover:border-[#F27D26]'
                          }`}
                        >
                          <span>{user.name}</span>
                          {isSelected && (
                            <span className={`text-[10px] ${isFixed ? 'text-[#F27D26] font-bold' : 'opacity-60'}`}>
                              ${share.toFixed(2)}
                            </span>
                          )}
                        </button>
                        
                        {isSelected && (
                          <button
                            onClick={() => toggleFixedShare(user.id)}
                            className={`px-3 rounded-xl border transition-all flex items-center justify-center ${
                              isFixed 
                                ? 'bg-[#F27D26] border-[#F27D26] text-white' 
                                : 'bg-white border-[#E5E5E5] text-[#8E9299] hover:border-[#F27D26]'
                            }`}
                            title={isFixed ? "Unlock to auto-split" : "Lock to set fixed amount"}
                          >
                            {isFixed ? <Trash2 size={14} /> : <Plus size={14} />}
                          </button>
                        )}
                      </div>
                      
                      <AnimatePresence>
                        {isSelected && isFixed && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E9299] text-xs">$</span>
                              <input
                                type="number"
                                placeholder="Fixed amount"
                                value={fixedShares[user.id] || ''}
                                onChange={(e) => handleFixedShareChange(user.id, e.target.value)}
                                className="w-full p-2 pl-6 bg-white border border-[#F27D26] rounded-xl text-sm focus:outline-none font-mono"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleAddExpense}
              className="w-full py-4 bg-[#F27D26] text-white rounded-2xl font-bold hover:bg-[#D96A1B] transition-colors shadow-lg shadow-orange-200"
            >
              Add Expense
            </button>
          </div>
        </section>

        {/* History Section */}
        <section className="space-y-6 pb-12">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <ArrowUpRight size={20} />
            </div>
            <h2 className="text-xl font-bold italic serif">expense history</h2>
          </div>

          <div className="bg-white border border-[#E5E5E5] rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F9F9F9] border-bottom border-[#E5E5E5]">
                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-[#8E9299] tracking-wider">Expense</th>
                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-[#8E9299] tracking-wider">Date</th>
                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-[#8E9299] tracking-wider">Time</th>
                    <th className="px-6 py-4 text-[10px] uppercase font-bold text-[#8E9299] tracking-wider text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5]">
                  <AnimatePresence mode="popLayout">
                    {expenses.length > 0 ? (
                      [...expenses].reverse().map((expense) => (
                        <motion.tr
                          key={expense.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-[#FDFCFB] transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-sm">{expense.name}</span>
                              <div className="flex flex-wrap gap-x-2 gap-y-1">
                                {expense.splitAmong.map(userId => {
                                  const user = users.find(u => u.id === userId);
                                  const isPayer = userId === expense.paidBy;
                                  return (
                                    <span 
                                      key={userId} 
                                      className={`text-[10px] font-bold uppercase tracking-tight ${
                                        isPayer ? 'text-green-600' : 'text-red-500'
                                      }`}
                                    >
                                      {user?.name}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#8E9299]">{expense.date}</td>
                          <td className="px-6 py-4 text-sm text-[#8E9299]">{expense.time}</td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-mono font-bold text-[#1A1A1A]">${expense.amount.toFixed(2)}</span>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-[#8E9299] italic text-sm">
                          No expenses recorded yet.
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
