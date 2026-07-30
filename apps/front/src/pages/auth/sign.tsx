import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { login, guestLogin } from '@/store/slices/authSlice';
import { Button } from '@pes/ui/components/button';
import { Input } from '@pes/ui/components/input';
import { Label } from '@pes/ui/components/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@pes/ui/components/card';
import { Alert, AlertDescription } from '@pes/ui/components/alert';


export default function Login() {
    const [searchParams] = useSearchParams();
    const [magic_token, setMagicToken] = useState('');
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { loading, error } = useAppSelector((state) => state.auth);

    const magicToken = searchParams.get('magic_token');

    useEffect(() => {
        async function signUser() {
            if (magicToken) {
                try {
                    await dispatch(login({ magic_token: magicToken })).unwrap()
                    navigate('/app');
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (err) {
                    // Error is handled by Redux state
                }
            }
        }

        signUser()
    }, [magicToken, dispatch, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await dispatch(login({ magic_token })).unwrap();
            navigate('/app');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            // Error is handled by Redux state
        }
    };

    const handleGuestLogin = async () => {
        try {
            await dispatch(guestLogin()).unwrap();
            navigate('/app');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            // Error is handled by Redux state
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Login</CardTitle>
                    <CardDescription>Enter your credentials to access your account</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2 mb-5">
                            <Label htmlFor="email">Magic Token</Label>
                            <Input
                                id="magic_token"
                                type="text"
                                value={magic_token}
                                onChange={(e) => setMagicToken(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col space-y-2">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Logging in...' : 'Login'}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={handleGuestLogin}
                            disabled={loading}
                        >
                            Continue as Guest
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}