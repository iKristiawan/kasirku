import React, { useState } from 'react';
import { 
  X, 
  Lock, 
  ShieldCheck, 
  Briefcase, 
  UserCheck, 
  Check, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { User } from '../types/pos';
import { sound } from '../utils/audio';

interface UserSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  currentUser: User;
  onSelectUser: (user: User) => void;
}

export const UserSwitchModal: React.FC<UserSwitchModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUser,
  onSelectUser,
}) => {
  const [selectedTargetUser, setSelectedTargetUser] = useState<User | null>(null);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleNumpad = (digit: string) => {
    sound.playTap();
    setPinError(false);
    if (digit === 'C') {
      setEnteredPin('');
      return;
    }
    if (digit === 'BACK') {
      setEnteredPin((prev) => prev.slice(0, -1));
      return;
    }

    if (enteredPin.length < 4) {
      const nextPin = enteredPin + digit;
      setEnteredPin(nextPin);

      // Auto submit on 4th digit
      if (nextPin.length === 4 && selectedTargetUser) {
        if (nextPin === selectedTargetUser.pin) {
          sound.playSuccessChime();
          onSelectUser(selectedTargetUser);
          setSelectedTargetUser(null);
          setEnteredPin('');
          onClose();
        } else {
          sound.playError();
          setPinError(true);
          setTimeout(() => {
            setEnteredPin('');
          }, 800);
        }
      }
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <ShieldCheck className="w-4 h-4 text-indigo-600" />;
      case 'STORE_MANAGER':
        return <Briefcase className="w-4 h-4 text-emerald-600" />;
      default:
        return <UserCheck className="w-4 h-4 text-amber-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-sky-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {selectedTargetUser ? 'Masukkan PIN Kasir' : 'Ganti Pengguna POS'}
              </h3>
              <p className="text-xs text-slate-400">
                {selectedTargetUser ? `Login sebagai ${selectedTargetUser.name}` : 'Pilih akun untuk mulai bertugas'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playTap();
              setSelectedTargetUser(null);
              setEnteredPin('');
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!selectedTargetUser ? (
          /* Step 1: Choose User */
          <div className="py-4 space-y-2">
            {users.map((u) => {
              const isCurrent = u.id === currentUser.id;
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    sound.playTap();
                    setSelectedTargetUser(u);
                    setEnteredPin('');
                    setPinError(false);
                  }}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                    isCurrent
                      ? 'border-sky-500 bg-sky-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${u.avatarColor} text-white flex items-center justify-center font-bold text-sm shadow-xs`}>
                      {u.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        {getRoleIcon(u.role)}
                        <span>{u.role}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {isCurrent ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-600 text-white">
                        Aktif Sekarang
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">Pilih & Masuk →</span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Hint Box for demo ease */}
            <div className="mt-4 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-sky-500" />
                <span>PIN Bawaan (Default):</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-600 pt-1">
                <div>Admin: <b>1234</b></div>
                <div>Manager: <b>2345</b></div>
                <div>Kasir: <b>3456</b></div>
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Numpad PIN Entry */
          <div className="py-4 space-y-4">
            <div className="text-center space-y-2">
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl font-bold font-mono transition-all ${
                      pinError
                        ? 'border-rose-500 bg-rose-50 text-rose-600'
                        : enteredPin.length > idx
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-slate-300 bg-slate-50 text-slate-400'
                    }`}
                  >
                    {enteredPin.length > idx ? '●' : ''}
                  </div>
                ))}
              </div>

              {pinError && (
                <p className="text-xs font-bold text-rose-600 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  PIN salah! Silakan coba lagi (Default: {selectedTargetUser.pin})
                </p>
              )}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumpad(num)}
                  className="py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-sky-100 font-bold text-lg font-mono text-slate-800 transition-colors shadow-2xs"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => handleNumpad('C')}
                className="py-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs"
              >
                CLEAR
              </button>
              <button
                onClick={() => handleNumpad('0')}
                className="py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-sky-100 font-bold text-lg font-mono text-slate-800 transition-colors shadow-2xs"
              >
                0
              </button>
              <button
                onClick={() => handleNumpad('BACK')}
                className="py-3.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
              >
                ←
              </button>
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={() => {
                  sound.playTap();
                  setSelectedTargetUser(null);
                  setEnteredPin('');
                }}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium underline"
              >
                Kembali ke daftar pengguna
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
