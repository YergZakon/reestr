// Страница модератора госоргана: создание аналитиков своего органа.
// Гвард роли и вся логика — в UserManager (kind="analysts").
import Header from "@/components/Header";
import UserManager from "@/components/UserManager";

export default function AnalystsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <UserManager kind="analysts" />
    </div>
  );
}
