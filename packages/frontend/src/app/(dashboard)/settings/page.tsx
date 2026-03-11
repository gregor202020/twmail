'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

const TIMEZONES = [
  'UTC',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
];

export default function GeneralSettingsPage() {
  const [orgName, setOrgName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [timezone, setTimezone] = useState('UTC');

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        organization_name: orgName,
        default_sender_email: senderEmail,
        default_sender_name: senderName,
        timezone,
      }),
    onSuccess: () => {
      toast.success('Settings saved');
    },
    onError: () => {
      toast.error('Failed to save settings');
    },
  });

  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[600px] mx-auto space-y-6">
          <div>
            <Label htmlFor="org-name" className="text-xs text-text-muted mb-1.5">
              Organization Name
            </Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Your organization"
            />
          </div>

          <div>
            <Label htmlFor="sender-email" className="text-xs text-text-muted mb-1.5">
              Default Sender Email
            </Label>
            <Input
              id="sender-email"
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="noreply@example.com"
            />
          </div>

          <div>
            <Label htmlFor="sender-name" className="text-xs text-text-muted mb-1.5">
              Default Sender Name
            </Label>
            <Input
              id="sender-name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Your Company"
            />
          </div>

          <div>
            <Label className="text-xs text-text-muted mb-1.5">
              Timezone
            </Label>
            <Select value={timezone} onValueChange={(val) => val && setTimezone(val)}>
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-4 border-t border-card-border">
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
