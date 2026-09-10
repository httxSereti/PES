import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { login, guestLogin } from '@/store/slices/authSlice';
import { Button } from '@pes/ui/components/button';
import { Input } from '@pes/ui/components/input';
import { Label } from '@pes/ui/components/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@pes/ui/components/card';
import { Alert, AlertDescription, AlertTitle } from '@pes/ui/components/alert';
import { AlertCircleIcon } from 'lucide-react';


export default function Login() {
    const [searchParams] = useSearchParams();
    const [magic_token, setMagicToken] = useState('');
    const [showGuestForm, setShowGuestForm] = useState(false);
    const [guestName, setGuestName] = useState('');
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
        if (showGuestForm) {
            await handleGuestLogin();
            return;
        }
        try {
            await dispatch(login({ magic_token })).unwrap();
            navigate('/app');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            // Error is handled by Redux state
        }
    };

    const handleGuestLogin = async () => {
        const display_name = guestName.trim();
        if (!display_name) return;
        try {
            await dispatch(guestLogin({ display_name })).unwrap();
            navigate('/app');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            // Error is handled by Redux state
        }
    };

    return (
        <div className="flex px-3 items-center justify-center min-h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Login</CardTitle>
                    <CardDescription>Guest can login without an account, but can only access limited features.</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-3">
                        {error && (
                            <Alert className="max-w-md">
                                <AlertCircleIcon />
                                <AlertTitle>Login failed!</AlertTitle>
                                <AlertDescription>
                                    Your credentials are invalid. Please ask Host to send you a new magic link or try again.
                                </AlertDescription>
                            </Alert>
                        )}

                        {showGuestForm && (
                            <div className="space-y-2">
                                <Label htmlFor="guest-name">Guest username</Label>
                                <Input
                                    id="guest-name"
                                    value={guestName}
                                    onChange={(e) => setGuestName(e.target.value)}
                                    placeholder="Enter a username"
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>
                        )}
                    </CardContent>

                    <CardFooter className="flex flex-col pt-5 space-y-2">
                        {showGuestForm ? (
                            <>
                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={loading || !guestName.trim()}
                                >
                                    Join as Guest
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full"
                                    onClick={() => setShowGuestForm(false)}
                                    disabled={loading}
                                >
                                    Back
                                </Button>
                            </>
                        ) : (
                            <Button
                                type="button"
                                className="w-full"
                                onClick={() => setShowGuestForm(true)}
                                disabled={loading}
                            >
                                Continue as Guest
                            </Button>
                        )}
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}