export declare const AUTHORIZED_PROVIDER_BIN: "bin/provider-invoke";

export declare function packageRelativeProviderBin(packageRoot: string, bin: string): string;

export declare function assertAuthorizedCaptureEnv(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): void;
