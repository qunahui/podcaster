import { QueryClient } from "@tanstack/react-query";

const getQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1 * 60 * 60 * 1000,
        refetchOnWindowFocus: "always",
        retry: false,
      },
    },
  });

export default getQueryClient;
