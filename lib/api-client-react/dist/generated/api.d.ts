import type { DataTag, DefinedInitialDataOptions, DefinedUseQueryResult, QueryClient, QueryKey, UndefinedInitialDataOptions, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Capabilities, ClearHistoryResult, ErrorResponse, Fix, HealthStatus, HistoryCount, HistoryRetention, HistoryRetentionInput, IssueInput, ProviderCheckResponse, SavedReportExport, Scan, ScanInput, ScanSummary, Verification, VerificationInput } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof healthCheck>>, TError, Awaited<ReturnType<typeof healthCheck>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof healthCheck>>, TError, Awaited<ReturnType<typeof healthCheck>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getGetConfigUrl: () => string;
export declare const getConfig: (options?: Parameters<typeof customFetch>[1]) => Promise<Capabilities>;
export declare const getGetConfigQueryKey: () => readonly ["/api/config"];
export declare const getGetConfigQueryOptions: <TData = Awaited<ReturnType<typeof getConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getConfig>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getConfig>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetConfigQueryResult = NonNullable<Awaited<ReturnType<typeof getConfig>>>;
export type GetConfigQueryError = ErrorType<unknown>;
export declare function useGetConfig<TData = Awaited<ReturnType<typeof getConfig>>, TError = ErrorType<unknown>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getConfig>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getConfig>>, TError, Awaited<ReturnType<typeof getConfig>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetConfig<TData = Awaited<ReturnType<typeof getConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getConfig>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getConfig>>, TError, Awaited<ReturnType<typeof getConfig>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetConfig<TData = Awaited<ReturnType<typeof getConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getConfig>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getCheckProviderUrl: () => string;
export declare const checkProvider: (options?: Parameters<typeof customFetch>[1]) => Promise<ProviderCheckResponse>;
export declare const getCheckProviderMutationKey: () => readonly ["checkProvider"];
export declare const getCheckProviderMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof checkProvider>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof checkProvider>>, TError, void, TContext>;
export type CheckProviderMutationResult = NonNullable<Awaited<ReturnType<typeof checkProvider>>>;
export type CheckProviderMutationError = ErrorType<ErrorResponse>;
export declare const useCheckProvider: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof checkProvider>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof checkProvider>>, TError, void, TContext>;
export declare const getCreateScanUrl: () => string;
export declare const createScan: (scanInput: ScanInput, options?: Parameters<typeof customFetch>[1]) => Promise<Scan>;
export declare const getCreateScanMutationKey: () => readonly ["createScan"];
export declare const getCreateScanMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createScan>>, TError, CreateScanMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createScan>>, TError, CreateScanMutationVariables, TContext>;
export type CreateScanMutationResult = NonNullable<Awaited<ReturnType<typeof createScan>>>;
export type CreateScanMutationBody = BodyType<ScanInput>;
export type CreateScanMutationError = ErrorType<ErrorResponse>;
export type CreateScanMutationVariables = {
    data: BodyType<ScanInput>;
};
export declare const useCreateScan: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createScan>>, TError, CreateScanMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof createScan>>, TError, CreateScanMutationVariables, TContext>;
export declare const getGetScanUrl: (id: string) => string;
export declare const getScan: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<Scan>;
export declare const getGetScanQueryKey: (id: string) => readonly [`/api/scan/${string}`];
export declare const getGetScanQueryOptions: <TData = Awaited<ReturnType<typeof getScan>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScan>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getScan>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetScanQueryResult = NonNullable<Awaited<ReturnType<typeof getScan>>>;
export type GetScanQueryError = ErrorType<ErrorResponse>;
export declare function useGetScan<TData = Awaited<ReturnType<typeof getScan>>, TError = ErrorType<ErrorResponse>>(id: string, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScan>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getScan>>, TError, Awaited<ReturnType<typeof getScan>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetScan<TData = Awaited<ReturnType<typeof getScan>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScan>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getScan>>, TError, Awaited<ReturnType<typeof getScan>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetScan<TData = Awaited<ReturnType<typeof getScan>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScan>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getExportScanReportUrl: (id: string) => string;
export declare const exportScanReport: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<SavedReportExport>;
export declare const getExportScanReportQueryKey: (id: string) => readonly [`/api/scan/${string}/export`];
export declare const getExportScanReportQueryOptions: <TData = Awaited<ReturnType<typeof exportScanReport>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type ExportScanReportQueryResult = NonNullable<Awaited<ReturnType<typeof exportScanReport>>>;
export type ExportScanReportQueryError = ErrorType<ErrorResponse>;
export declare function useExportScanReport<TData = Awaited<ReturnType<typeof exportScanReport>>, TError = ErrorType<ErrorResponse>>(id: string, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, Awaited<ReturnType<typeof exportScanReport>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useExportScanReport<TData = Awaited<ReturnType<typeof exportScanReport>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, Awaited<ReturnType<typeof exportScanReport>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useExportScanReport<TData = Awaited<ReturnType<typeof exportScanReport>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof exportScanReport>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getGetScanScreenshotUrl: (id: string) => string;
export declare const getScanScreenshot: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<Blob>;
export declare const getGetScanScreenshotQueryKey: (id: string) => readonly [`/api/scan/${string}/screenshot`];
export declare const getGetScanScreenshotQueryOptions: <TData = Awaited<ReturnType<typeof getScanScreenshot>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetScanScreenshotQueryResult = NonNullable<Awaited<ReturnType<typeof getScanScreenshot>>>;
export type GetScanScreenshotQueryError = ErrorType<ErrorResponse>;
export declare function useGetScanScreenshot<TData = Awaited<ReturnType<typeof getScanScreenshot>>, TError = ErrorType<ErrorResponse>>(id: string, options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, Awaited<ReturnType<typeof getScanScreenshot>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetScanScreenshot<TData = Awaited<ReturnType<typeof getScanScreenshot>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, Awaited<ReturnType<typeof getScanScreenshot>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetScanScreenshot<TData = Awaited<ReturnType<typeof getScanScreenshot>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getScanScreenshot>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getGetHistoryUrl: () => string;
export declare const getHistory: (options?: Parameters<typeof customFetch>[1]) => Promise<ScanSummary[]>;
export declare const getGetHistoryQueryKey: () => readonly ["/api/history"];
export declare const getGetHistoryQueryOptions: <TData = Awaited<ReturnType<typeof getHistory>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistory>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getHistory>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof getHistory>>>;
export type GetHistoryQueryError = ErrorType<ErrorResponse>;
export declare function useGetHistory<TData = Awaited<ReturnType<typeof getHistory>>, TError = ErrorType<ErrorResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistory>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getHistory>>, TError, Awaited<ReturnType<typeof getHistory>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetHistory<TData = Awaited<ReturnType<typeof getHistory>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistory>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getHistory>>, TError, Awaited<ReturnType<typeof getHistory>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetHistory<TData = Awaited<ReturnType<typeof getHistory>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistory>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getClearHistoryUrl: () => string;
export declare const clearHistory: (options?: Parameters<typeof customFetch>[1]) => Promise<ClearHistoryResult>;
export declare const getClearHistoryMutationKey: () => readonly ["clearHistory"];
export declare const getClearHistoryMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof clearHistory>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof clearHistory>>, TError, void, TContext>;
export type ClearHistoryMutationResult = NonNullable<Awaited<ReturnType<typeof clearHistory>>>;
export type ClearHistoryMutationError = ErrorType<ErrorResponse>;
export declare const useClearHistory: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof clearHistory>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof clearHistory>>, TError, void, TContext>;
export declare const getGetHistoryCountUrl: () => string;
export declare const getHistoryCount: (options?: Parameters<typeof customFetch>[1]) => Promise<HistoryCount>;
export declare const getGetHistoryCountQueryKey: () => readonly ["/api/history/count"];
export declare const getGetHistoryCountQueryOptions: <TData = Awaited<ReturnType<typeof getHistoryCount>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetHistoryCountQueryResult = NonNullable<Awaited<ReturnType<typeof getHistoryCount>>>;
export type GetHistoryCountQueryError = ErrorType<ErrorResponse>;
export declare function useGetHistoryCount<TData = Awaited<ReturnType<typeof getHistoryCount>>, TError = ErrorType<ErrorResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, Awaited<ReturnType<typeof getHistoryCount>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetHistoryCount<TData = Awaited<ReturnType<typeof getHistoryCount>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, Awaited<ReturnType<typeof getHistoryCount>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetHistoryCount<TData = Awaited<ReturnType<typeof getHistoryCount>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryCount>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getGetHistoryRetentionUrl: () => string;
export declare const getHistoryRetention: (options?: Parameters<typeof customFetch>[1]) => Promise<HistoryRetention>;
export declare const getGetHistoryRetentionQueryKey: () => readonly ["/api/history/retention"];
export declare const getGetHistoryRetentionQueryOptions: <TData = Awaited<ReturnType<typeof getHistoryRetention>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export type GetHistoryRetentionQueryResult = NonNullable<Awaited<ReturnType<typeof getHistoryRetention>>>;
export type GetHistoryRetentionQueryError = ErrorType<ErrorResponse>;
export declare function useGetHistoryRetention<TData = Awaited<ReturnType<typeof getHistoryRetention>>, TError = ErrorType<ErrorResponse>>(options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, TData>> & Pick<DefinedInitialDataOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, Awaited<ReturnType<typeof getHistoryRetention>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): DefinedUseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetHistoryRetention<TData = Awaited<ReturnType<typeof getHistoryRetention>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, TData>> & Pick<UndefinedInitialDataOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, Awaited<ReturnType<typeof getHistoryRetention>>>, 'initialData'>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare function useGetHistoryRetention<TData = Awaited<ReturnType<typeof getHistoryRetention>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof getHistoryRetention>>, TError, TData>>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient): UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>;
};
export declare const getUpdateHistoryRetentionUrl: () => string;
export declare const updateHistoryRetention: (historyRetentionInput: HistoryRetentionInput, options?: Parameters<typeof customFetch>[1]) => Promise<HistoryRetention>;
export declare const getUpdateHistoryRetentionMutationKey: () => readonly ["updateHistoryRetention"];
export declare const getUpdateHistoryRetentionMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateHistoryRetention>>, TError, UpdateHistoryRetentionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateHistoryRetention>>, TError, UpdateHistoryRetentionMutationVariables, TContext>;
export type UpdateHistoryRetentionMutationResult = NonNullable<Awaited<ReturnType<typeof updateHistoryRetention>>>;
export type UpdateHistoryRetentionMutationBody = BodyType<HistoryRetentionInput>;
export type UpdateHistoryRetentionMutationError = ErrorType<ErrorResponse>;
export type UpdateHistoryRetentionMutationVariables = {
    data: BodyType<HistoryRetentionInput>;
};
export declare const useUpdateHistoryRetention: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateHistoryRetention>>, TError, UpdateHistoryRetentionMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof updateHistoryRetention>>, TError, UpdateHistoryRetentionMutationVariables, TContext>;
export declare const getDeleteHistoryUrl: (id: string) => string;
export declare const deleteHistory: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<void>;
export declare const getDeleteHistoryMutationKey: () => readonly ["deleteHistory"];
export declare const getDeleteHistoryMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteHistory>>, TError, DeleteHistoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteHistory>>, TError, DeleteHistoryMutationVariables, TContext>;
export type DeleteHistoryMutationResult = NonNullable<Awaited<ReturnType<typeof deleteHistory>>>;
export type DeleteHistoryMutationError = ErrorType<ErrorResponse>;
export type DeleteHistoryMutationVariables = {
    id: string;
};
export declare const useDeleteHistory: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteHistory>>, TError, DeleteHistoryMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof deleteHistory>>, TError, DeleteHistoryMutationVariables, TContext>;
export declare const getRemediateUrl: () => string;
export declare const remediate: (issueInput: IssueInput, options?: Parameters<typeof customFetch>[1]) => Promise<Fix>;
export declare const getRemediateMutationKey: () => readonly ["remediate"];
export declare const getRemediateMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof remediate>>, TError, RemediateMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof remediate>>, TError, RemediateMutationVariables, TContext>;
export type RemediateMutationResult = NonNullable<Awaited<ReturnType<typeof remediate>>>;
export type RemediateMutationBody = BodyType<IssueInput>;
export type RemediateMutationError = ErrorType<ErrorResponse>;
export type RemediateMutationVariables = {
    data: BodyType<IssueInput>;
};
export declare const useRemediate: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof remediate>>, TError, RemediateMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof remediate>>, TError, RemediateMutationVariables, TContext>;
export declare const getVerifyFixUrl: () => string;
export declare const verifyFix: (verificationInput: VerificationInput, options?: Parameters<typeof customFetch>[1]) => Promise<Verification>;
export declare const getVerifyFixMutationKey: () => readonly ["verifyFix"];
export declare const getVerifyFixMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof verifyFix>>, TError, VerifyFixMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof verifyFix>>, TError, VerifyFixMutationVariables, TContext>;
export type VerifyFixMutationResult = NonNullable<Awaited<ReturnType<typeof verifyFix>>>;
export type VerifyFixMutationBody = BodyType<VerificationInput>;
export type VerifyFixMutationError = ErrorType<ErrorResponse>;
export type VerifyFixMutationVariables = {
    data: BodyType<VerificationInput>;
};
export declare const useVerifyFix: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof verifyFix>>, TError, VerifyFixMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}, queryClient?: QueryClient) => UseMutationResult<Awaited<ReturnType<typeof verifyFix>>, TError, VerifyFixMutationVariables, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map