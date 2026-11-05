import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";

function Main() {
  const [session, setSession] = useState(null);
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!oldPassword || !password || !confirm) {
      setError("Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      // Re-verify the current password first.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email,
        password: oldPassword,
      });
      if (verifyError) {
        setError("The current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(friendlyError(updateError));
        return;
      }

      setOldPassword("");
      setPassword("");
      setConfirm("");
      setSuccess("Your password has been changed.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const profile = session?.profile;

  return (
    <>
      <div className="intro-y flex items-center mt-8">
        <h2 className="text-lg font-medium mr-auto">Change Password</h2>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 2xl:col-span-3 flex lg:block flex-col-reverse">
          <div className="intro-y box mt-5">
            <div className="relative flex items-center p-5">
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <Lucide icon="User" className="w-6 h-6" />
              </div>
              <div className="ml-4 mr-auto">
                <div className="font-medium text-base">
                  {profile?.full_name || profile?.email || "-"}
                </div>
                <div className="text-slate-500">{profile?.email}</div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200/60 dark:border-darkmode-400">
              <Link className="flex items-center" to="/update-profile">
                <Lucide icon="Activity" className="w-4 h-4 mr-2" /> Personal Information
              </Link>
              <Link className="flex items-center mt-5 text-primary font-medium" to="/change-password">
                <Lucide icon="Lock" className="w-4 h-4 mr-2" /> Change Password
              </Link>
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-8 2xl:col-span-9">
          <div className="intro-y box lg:mt-5">
            <div className="flex items-center p-5 border-b border-slate-200/60 dark:border-darkmode-400">
              <h2 className="font-medium text-base mr-auto">Change Password</h2>
            </div>
            <form className="p-5" onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{error}</div>
              )}
              {success && (
                <div className="mb-4 p-3 rounded-md bg-success/10 text-success text-sm">{success}</div>
              )}
              <div>
                <label htmlFor="change-password-form-1" className="form-label">
                  Current Password
                </label>
                <input
                  id="change-password-form-1"
                  type="password"
                  className="form-control"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <label htmlFor="change-password-form-2" className="form-label">
                  New Password
                </label>
                <input
                  id="change-password-form-2"
                  type="password"
                  className="form-control"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <label htmlFor="change-password-form-3" className="form-label">
                  Confirm New Password
                </label>
                <input
                  id="change-password-form-3"
                  type="password"
                  className="form-control"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button type="submit" disabled={saving || !session} className="btn btn-primary mt-4">
                {saving ? "Saving..." : "Change Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export default Main;
