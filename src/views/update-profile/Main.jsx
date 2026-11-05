import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { getSession, clearSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";

function Main() {
  const [session, setSession] = useState(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      if (s?.profile) setFullName(s.profile.full_name || "");
    });
  }, []);

  // phone / avatar_url are not part of the cached session profile, so load them.
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from("profiles")
      .select("phone, avatar_url")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPhone(data.phone || "");
          setAvatarUrl(data.avatar_url || "");
        }
      });
  }, [session?.user?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("id", session.user.id);

      if (updateError) {
        setError(friendlyError(updateError));
        return;
      }

      clearSession();
      setSuccess("Your profile has been updated.");
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
        <h2 className="text-lg font-medium mr-auto">Update Profile</h2>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4 2xl:col-span-3 flex lg:block flex-col-reverse">
          <div className="intro-y box mt-5">
            <div className="relative flex items-center p-5">
              <div className="w-12 h-12 image-fit">
                {avatarUrl ? (
                  <img alt="Avatar" className="rounded-full" src={avatarUrl} />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                    <Lucide icon="User" className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="ml-4 mr-auto">
                <div className="font-medium text-base">
                  {profile?.full_name || profile?.email || "-"}
                </div>
                <div className="text-slate-500">{profile ? titleCase(profile.role) : ""}</div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200/60 dark:border-darkmode-400">
              <Link className="flex items-center text-primary font-medium" to="/update-profile">
                <Lucide icon="Activity" className="w-4 h-4 mr-2" /> Personal Information
              </Link>
              <Link className="flex items-center mt-5" to="/change-password">
                <Lucide icon="Lock" className="w-4 h-4 mr-2" /> Change Password
              </Link>
            </div>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-8 2xl:col-span-9">
          <div className="intro-y box lg:mt-5">
            <div className="flex items-center p-5 border-b border-slate-200/60 dark:border-darkmode-400">
              <h2 className="font-medium text-base mr-auto">Personal Information</h2>
            </div>
            <form className="p-5" onSubmit={handleSave}>
              {error && (
                <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{error}</div>
              )}
              {success && (
                <div className="mb-4 p-3 rounded-md bg-success/10 text-success text-sm">{success}</div>
              )}
              <div className="grid grid-cols-12 gap-x-5">
                <div className="col-span-12 xl:col-span-6">
                  <label htmlFor="update-profile-form-1" className="form-label">
                    Email
                  </label>
                  <input
                    id="update-profile-form-1"
                    type="text"
                    className="form-control"
                    value={profile?.email || session?.user?.email || ""}
                    readOnly
                    disabled
                  />
                </div>
                <div className="col-span-12 xl:col-span-6 mt-3 xl:mt-0">
                  <label htmlFor="update-profile-form-2" className="form-label">
                    Full Name
                  </label>
                  <input
                    id="update-profile-form-2"
                    type="text"
                    className="form-control"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="col-span-12 xl:col-span-6 mt-3">
                  <label htmlFor="update-profile-form-3" className="form-label">
                    Phone Number
                  </label>
                  <input
                    id="update-profile-form-3"
                    type="text"
                    className="form-control"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="col-span-12 xl:col-span-6 mt-3">
                  <label htmlFor="update-profile-form-4" className="form-label">
                    Avatar URL
                  </label>
                  <input
                    id="update-profile-form-4"
                    type="url"
                    className="form-control"
                    placeholder="https://..."
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" disabled={saving || !session} className="btn btn-primary mt-4">
                {saving ? "Saving..." : "Save"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export default Main;
