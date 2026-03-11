'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Contact } from '@/types';

const addContactSchema = z.object({
  email: z.string().email('Valid email is required'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
});

type AddContactForm = z.infer<typeof addContactSchema>;

interface AddContactDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddContactDrawer({ open, onOpenChange }: AddContactDrawerProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddContactForm>({
    resolver: zodResolver(addContactSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      company: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: AddContactForm) =>
      api.post<{ data: Contact }>('/contacts', data),
    onSuccess: () => {
      toast.success('Contact created');
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create contact');
    },
  });

  const onSubmit = (data: AddContactForm) => {
    mutation.mutate(data);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Contact</SheetTitle>
          <SheetDescription>
            Create a new contact. Only email is required.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 flex-1">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && (
              <p className="text-xs text-status-danger">{errors.email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First Name</Label>
              <Input id="first_name" {...register('first_name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last Name</Label>
              <Input id="last_name" {...register('last_name')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" {...register('phone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company">Company</Label>
            <Input id="company" {...register('company')} />
          </div>
        </form>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="bg-tw-blue hover:bg-tw-blue-dark"
            onClick={handleSubmit(onSubmit)}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating...' : 'Create Contact'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
