import type { AccountMeta } from "@stellix/core";
import { useCallback, useEffect, useState } from "react";
import { request } from "../../messaging/client.js";

export function useAccounts(): { accounts: AccountMeta[] | null; reload: () => void } {
  const [accounts, setAccounts] = useState<AccountMeta[] | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let current = true;
    void request("LIST_ACCOUNTS", undefined).then(
      (list) => {
        if (current) setAccounts(list);
      },
      () => {
        if (current) setAccounts([]);
      },
    );
    return () => {
      current = false;
    };
  }, [generation]);
  const reload = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);
  return { accounts, reload };
}
