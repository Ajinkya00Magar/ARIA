'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import apiClient from '@/lib/api-client';

export default function OnboardingPage() {
  const router = useRouter();
  const [option, setOption] = useState<'free' | 'api_key' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (option === 'api_key' && !apiKey) {
      toast.error('Please enter your API Key');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.put('/settings', {
        hasCompletedOnboarding: true,
        watsonxApiKey: option === 'api_key' ? apiKey : null,
      });
      toast.success('Onboarding complete!');
      router.replace('/dashboard');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Welcome to ARIA IDE</CardTitle>
          <CardDescription>Choose how you want to power your AI Coding Agent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              option === 'free' ? 'border-primary bg-primary/10' : 'hover:border-primary/50'
            }`}
            onClick={() => setOption('free')}
          >
            <div className="font-semibold">Free Tier (Limited)</div>
            <div className="text-sm text-muted-foreground">Get started immediately with free but rate-limited tokens.</div>
          </div>

          <div
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${
              option === 'api_key' ? 'border-primary bg-primary/10' : 'hover:border-primary/50'
            }`}
            onClick={() => setOption('api_key')}
          >
            <div className="font-semibold">Personal API Key (Unlimited)</div>
            <div className="text-sm text-muted-foreground">Provide your own API keys for unlimited AI usage and maximum speed.</div>
          </div>

          {option === 'api_key' && (
            <div className="space-y-2 mt-4 animate-in fade-in slide-in-from-top-2">
              <Label htmlFor="api-key">Watsonx API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your API key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button disabled={!option || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? 'Saving...' : 'Continue'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
