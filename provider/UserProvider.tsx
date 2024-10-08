"use client";
import { User } from "@/types/User";
import { Cookie as cookies, getCookie } from "@/utils/Cookies";
import {
  type ReactNode,
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";
import useSWRImmutable from "swr/immutable";
import Storage from "@/utils/Storage";
import { getUrl, revalUrl } from "@/utils/URL";
import { useTransitionRouter } from "next-view-transitions";
import { token } from "@/utils/Encrypt";

interface UserContextType {
  user: User | null;
  error: Error | null;
  isLoading: boolean;
  mutate: () => Promise<void | User | null | undefined>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  error: null,
  isLoading: false,
  mutate: async () => {},
});

const fetcher = async (url: string) => {
  const cookie = cookies.get("key");
  if (!cookie) return null;

  const cook = getCookie(cookie ?? "", "_iamadt_client_10002227248");
  if (
    !cook ||
    cook === "" ||
    cook === "undefined" ||
    cookie.includes("undefined")
  )
    return null;
  else
    try {
      const response = await fetch(getUrl(cookie, "/user") + "/user", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token()}`,
          "X-CSRF-Token": cookie,
          "Set-Cookie": cookie,
          Cookie: cookie,
          Connection: "keep-alive",
          "content-type": "application/json",
          "Cache-Control": "private, maxage=86400, stale-while-revalidate=7200",
        },
      });

      if (!response.ok) {
        const errorBody = await response.json();
        if (errorBody.logout) return errorBody;

        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorBody}`,
        );
      }

      const data = await response.json();
      if (!data || !data.user) {
        throw new Error("Invalid response format");
      }

      return data.user;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("An unexpected error occurred");
    }
};

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser?: User | null;
}) {
  const router = useTransitionRouter();
  const [retryCount, setRetryCount] = useState(0);

  const getCachedUser = useCallback(
    () => Storage.get<User | null>("user", null),
    [],
  );

  const cookie = cookies.get("key");

  const {
    data: user,
    error,
    isValidating,
    mutate,
  } = useSWRImmutable<User | null>(
    cookie ? `${revalUrl}/user` : null,
    fetcher,
    {
      fallbackData: initialUser || getCachedUser(),
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: true,
      errorRetryCount: 2,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      dedupingInterval: 1000 * 60 * 2,
      onErrorRetry: (error, key, config, revalidate, { retryCount }) => {
        if (retryCount >= 2) return;

        setTimeout(() => revalidate({ retryCount }), 3000);
      },
      onSuccess: (data) => {
        if (data) {
          if (data.logout) router.push("/auth/logout");
          Storage.set("user", data);
        }
        setRetryCount(0);
      },
    },
  );

  return (
    <UserContext.Provider
      value={{
        user: user || null,
        error: error || null,
        isLoading: isValidating,
        mutate,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
