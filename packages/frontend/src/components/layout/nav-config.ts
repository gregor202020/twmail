import {
  LayoutDashboard, Users, Send, FileText, Filter, BarChart3, Settings,
} from 'lucide-react';

export const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Contacts', href: '/contacts' },
  { icon: Send, label: 'Campaigns', href: '/campaigns' },
  { icon: FileText, label: 'Templates', href: '/templates' },
  { icon: Filter, label: 'Segments', href: '/segments' },
  { icon: BarChart3, label: 'Reports', href: '/reports' },
] as const;

export const bottomNavItems = [
  { icon: Settings, label: 'Settings', href: '/settings' },
] as const;

export const sectionTabs: Record<string, Array<{ label: string; href: string }>> = {
  '/campaigns': [
    { label: 'All', href: '/campaigns' },
    { label: 'Drafts', href: '/campaigns?status=1' },
    { label: 'Scheduled', href: '/campaigns?status=2' },
    { label: 'Sent', href: '/campaigns?status=4' },
  ],
  '/contacts': [
    { label: 'All', href: '/contacts' },
    { label: 'Active', href: '/contacts?status=1' },
    { label: 'Unsubscribed', href: '/contacts?status=2' },
    { label: 'Bounced', href: '/contacts?status=3' },
  ],
  '/reports': [
    { label: 'Overview', href: '/reports' },
    { label: 'Campaigns', href: '/reports/campaigns' },
    { label: 'Deliverability', href: '/reports/deliverability' },
  ],
  '/settings': [
    { label: 'General', href: '/settings' },
    { label: 'Webhooks', href: '/settings/webhooks' },
    { label: 'API Keys', href: '/settings/api-keys' },
    { label: 'Users', href: '/settings/users' },
    { label: 'Domain', href: '/settings/domain' },
  ],
};
