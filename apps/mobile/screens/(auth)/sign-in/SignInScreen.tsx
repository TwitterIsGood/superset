import { useRouter } from "expo-router";
import { useState } from "react";
import {
	Image,
	KeyboardAvoidingView,
	Linking,
	Platform,
	ScrollView,
	View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
	authClient,
	signIn,
	signInWithEmail,
	useSession,
} from "@/lib/auth/client";
import { ensureActiveOrganization } from "@/lib/auth/organization";
import { env } from "@/lib/env";

import type { SocialProvider } from "./components/SocialButton";
import { SocialButton } from "./components/SocialButton";

const TERMS_URL = "https://superset.sh/terms";
const PRIVACY_URL = "https://superset.sh/privacy";
const shouldDisableAssociatedDomainAutofill =
	env.EXPO_PUBLIC_API_URL.includes("localhost") ||
	env.EXPO_PUBLIC_API_URL.includes("127.0.0.1");

function getEmailSignInErrorMessage(error: {
	code?: string;
	message?: string;
}): string {
	if (error.code === "INVALID_EMAIL_OR_PASSWORD") {
		return "Email or password is incorrect.";
	}
	if (error.code === "EMAIL_PASSWORD_DISABLED") {
		return "Email and password sign-in is not available.";
	}
	return error.message ?? "Authentication failed.";
}

export function SignInScreen() {
	const router = useRouter();
	const { refetch: refetchSession } = useSession();
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);
	const [socialProvider, setSocialProvider] = useState<SocialProvider | null>(
		null,
	);

	const isBusy = isEmailSubmitting || socialProvider !== null;

	const handleSignIn = async (provider: SocialProvider) => {
		setError(null);
		setSocialProvider(provider);
		try {
			await signIn.social({
				provider,
				callbackURL: "/",
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Something went wrong";
			console.error("[sign-in] Error:", err);
			setError(message);
		} finally {
			setSocialProvider(null);
		}
	};

	const handleEmailSignIn = async () => {
		const trimmedEmail = email.trim().toLowerCase();
		if (trimmedEmail.length === 0 || password.length === 0) {
			setError("Enter your email and password.");
			return;
		}

		setError(null);
		setIsEmailSubmitting(true);
		try {
			const result = await signInWithEmail({
				email: trimmedEmail,
				password,
			});

			if (result.error) {
				throw new Error(getEmailSignInErrorMessage(result.error));
			}

			await refetchSession();
			const sessionResult = await authClient.getSession();
			await ensureActiveOrganization({
				activeOrganizationId:
					sessionResult.data?.session?.activeOrganizationId ?? null,
				refetchSession,
			});
			router.replace("/(authenticated)/(home)");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Something went wrong";
			console.error("[email-sign-in] Error:", err);
			setError(message);
		} finally {
			setIsEmailSubmitting(false);
		}
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			className="flex-1 bg-background"
		>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="min-h-full justify-center px-6 py-10"
			>
				<View className="items-center gap-6">
					<Image
						source={require("@/assets/icon.png")}
						style={{ width: 64, height: 64, borderRadius: 14 }}
					/>

					<View className="items-center gap-1">
						<Text className="text-xl font-semibold text-foreground">
							Welcome to Superset
						</Text>
						<Text className="text-sm text-muted-foreground">
							Sign in with your account
						</Text>
					</View>

					<View className="w-full max-w-sm gap-3">
						<View className="gap-1.5">
							<Text className="text-xs font-medium text-muted-foreground">
								Email
							</Text>
							<Input
								accessibilityLabel="Email"
								testID="sign-in-email-input"
								value={email}
								onChangeText={setEmail}
								autoCapitalize="none"
								autoCorrect={false}
								autoComplete={
									shouldDisableAssociatedDomainAutofill ? "off" : "email"
								}
								editable={!isBusy}
								inputMode="email"
								keyboardType="email-address"
								placeholder="you@example.com"
								returnKeyType="next"
								textContentType={
									shouldDisableAssociatedDomainAutofill ? "none" : "username"
								}
							/>
						</View>
						<View className="gap-1.5">
							<Text className="text-xs font-medium text-muted-foreground">
								Password
							</Text>
							<Input
								accessibilityLabel="Password"
								testID="sign-in-password-input"
								value={password}
								onChangeText={setPassword}
								autoCapitalize="none"
								autoCorrect={false}
								autoComplete={
									shouldDisableAssociatedDomainAutofill
										? "off"
										: "current-password"
								}
								editable={!isBusy}
								placeholder="Password"
								returnKeyType="done"
								secureTextEntry
								textContentType={
									shouldDisableAssociatedDomainAutofill ? "none" : "password"
								}
								onSubmitEditing={handleEmailSignIn}
							/>
						</View>

						<Button
							accessibilityLabel="Sign in with email"
							testID="sign-in-email-button"
							size="lg"
							disabled={isBusy}
							onPress={handleEmailSignIn}
							className="w-full"
						>
							<Text>{isEmailSubmitting ? "Signing in..." : "Sign in"}</Text>
						</Button>
					</View>

					{error && (
						<Text className="text-center text-sm text-destructive">
							{error}
						</Text>
					)}

					<View className="w-full max-w-sm gap-3">
						<View className="flex-row items-center gap-3">
							<View className="h-px flex-1 bg-border" />
							<Text className="text-xs text-muted-foreground">
								or continue with
							</Text>
							<View className="h-px flex-1 bg-border" />
						</View>

						<View className="gap-2">
							<SocialButton
								provider="github"
								onPress={() => handleSignIn("github")}
								disabled={isBusy}
								className="w-full"
							/>
							<SocialButton
								provider="google"
								onPress={() => handleSignIn("google")}
								disabled={isBusy}
								className="w-full"
							/>
						</View>
					</View>

					<Text className="text-center text-xs text-muted-foreground/70">
						By signing in, you agree to our{"\n"}
						<Text
							className="text-xs text-muted-foreground underline"
							onPress={() => Linking.openURL(TERMS_URL)}
						>
							Terms of Service
						</Text>{" "}
						and{" "}
						<Text
							className="text-xs text-muted-foreground underline"
							onPress={() => Linking.openURL(PRIVACY_URL)}
						>
							Privacy Policy
						</Text>
					</Text>
				</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}
