import React, { useEffect, useMemo, useState } from "react";
import { supabase, readableError } from "./data/client.js";
import { repositories } from "./data/repositories.js";
import { PendingAccess } from "./ConnectedForms.jsx";
import InstitutionPortal from "./InstitutionPortal.jsx";
export default function ConnectedApp({ session }) {
  const repo = useMemo(() => repositories(supabase), []),
    [institutions, setInstitutions] = useState([]),
    [memberships, setMemberships] = useState([]),
    [tenant, setTenant] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([repo.institutions(), repo.memberships()])
      .then(([institutions, memberships]) => {
        if (!active) return;
        setInstitutions(institutions);
        setMemberships(memberships);
        setTenant((current) =>
          institutions.some((i) => i.id === current)
            ? current
            : institutions[0]?.id || "",
        );
        setLoading(false);
      })
      .catch((error) => {
        if (active) {
          setError(readableError(error));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [repo, revision]);
  const institution = institutions.find((i) => i.id === tenant),
    membership = memberships.find(
      (m) => m.institution_id === tenant && m.user_id === session.user.id,
    );
  if (loading || !institution)
    return (
      <div className="account-shell">
        <div className="account-pending">
          {loading ? (
            <p role="status">Carregando acesso…</p>
          ) : (
            <>
              {error ? (
                <p className="school-error" role="alert">
                  {error}
                </p>
              ) : (
                <PendingAccess onRefresh={() => setRevision((v) => v + 1)} />
              )}
              <button
                className="secondary"
                onClick={() => supabase.auth.signOut({ scope: "local" })}
              >
                Sair da conta
              </button>
            </>
          )}
        </div>
      </div>
    );
  return (
    <InstitutionPortal
      key={tenant}
      session={session}
      institution={institution}
      institutions={institutions}
      onTenant={setTenant}
      onInstitutionChanged={async () =>
        setInstitutions(await repo.institutions())
      }
      membership={membership}
      repo={repo}
    />
  );
}
