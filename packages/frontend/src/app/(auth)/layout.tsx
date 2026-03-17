export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-tw-red to-tw-red-dark rounded-xl flex items-center justify-center text-white text-lg font-extrabold shadow-lg shadow-tw-red/30">
            TW
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
