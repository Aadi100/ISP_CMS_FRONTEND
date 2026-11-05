import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CATEGORY_OPTIONS } from "./shared";

// Active ticket categories from the database; falls back to the built-in labels.
export default function useCategories() {
  const [categories, setCategories] = useState(
    CATEGORY_OPTIONS.map((name) => ({ name, default_priority: null }))
  );
  useEffect(() => {
    supabase
      .from("ticket_categories")
      .select("name, default_priority")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data && data.length) setCategories(data);
      });
  }, []);
  return categories;
}
