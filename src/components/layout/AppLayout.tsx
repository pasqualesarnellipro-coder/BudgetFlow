import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAppStore } from '@/store/useAppStore'

export function AppLayout() {
  const profile = useAppStore((s) => s.profile)

  if (!profile) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        profileType={profile.profile_type}
        username={profile.name}
        currency={profile.currency}
      />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
