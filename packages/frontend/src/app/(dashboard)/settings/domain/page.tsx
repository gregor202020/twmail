'use client';
import { Info, Globe, CheckCircle2 } from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const DNS_RECORDS = [
  { type: 'TXT', name: '_dmarc.example.com', value: 'v=DMARC1; p=none;', status: 'Pending' },
  { type: 'TXT', name: 'twmail._domainkey.example.com', value: 'v=DKIM1; k=rsa; p=MIGf...', status: 'Pending' },
  { type: 'CNAME', name: 'mail.example.com', value: 'return.twmail.io', status: 'Pending' },
];

export default function DomainSettingsPage() {
  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[800px] mx-auto space-y-6">
          <div className="flex items-start gap-3 p-4 bg-tw-blue-light border border-tw-blue/20 rounded-xl">
            <Info className="w-5 h-5 text-tw-blue shrink-0 mt-0.5" />
            <div className="text-xs text-tw-blue">
              <strong>Domain verification</strong> &mdash; coming soon.
              Configure your sending domain to improve deliverability and brand trust.
            </div>
          </div>

          <div className="space-y-4 opacity-60 pointer-events-none">
            <div>
              <Label htmlFor="domain" className="text-xs text-text-muted mb-1.5">
                Sending Domain
              </Label>
              <div className="flex gap-2">
                <Input
                  id="domain"
                  placeholder="example.com"
                  disabled
                  className="max-w-sm"
                />
                <Button variant="outline" size="sm" disabled>
                  <Globe className="w-3.5 h-3.5" />
                  Add Domain
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-3">DNS Records</h3>
              <div className="border border-card-border rounded-[14px] bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Type</span>
                      </TableHead>
                      <TableHead>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Name</span>
                      </TableHead>
                      <TableHead>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Value</span>
                      </TableHead>
                      <TableHead>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Status</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {DNS_RECORDS.map((record, i) => (
                      <TableRow key={i} className="hover:bg-surface/50">
                        <TableCell>
                          <span className="text-xs font-mono text-text-primary">{record.type}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-text-secondary">{record.name}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-text-muted truncate block max-w-[200px]">
                            {record.value}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                            <CheckCircle2 className="w-3 h-3" />
                            {record.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-card-border">
              <Button
                className="bg-tw-blue hover:bg-tw-blue-dark"
                size="sm"
                disabled
              >
                Verify Domain
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
