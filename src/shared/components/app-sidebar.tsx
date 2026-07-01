"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/shared/context/auth-context";
import { cn, getInitials } from "@/shared/utils";
import { Avatar, AvatarFallback } from "@/src/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/shared/components/ui/dropdown-menu";
import { ClientPickerDialog } from "@/shared/components/client-picker-dialog";
import {
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Shield,
  Tag,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const clientSections: NavSection[] = [
  {
    label: "Projetos",
    items: [
      { href: "/cliente/solicitar", label: "Solicitar Projeto", icon: PlusCircle },
      { href: "/cliente", label: "Meus Projetos", icon: FolderKanban },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/cliente/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const developerSections: NavSection[] = [
  {
    label: "Trabalho",
    items: [
      { href: "/desenvolvedor", label: "Projetos", icon: FolderKanban },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/desenvolvedor/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const adminSections: NavSection[] = [
  {
    label: "Visão Geral",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Gestão",
    items: [
      { href: "/admin/projetos", label: "Projetos", icon: FolderKanban },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/configuracoes/categorias", label: "Categorias", icon: Tag },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    logout,
    isSuperAdmin,
    viewAsAdmin,
    viewAsDeveloper,
    viewAsClient,
  } = useAuth();
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const sections =
    user?.role === "admin"
      ? adminSections
      : user?.role === "developer"
        ? developerSections
        : clientSections;

  const rootHrefs = new Set(["/", "/cliente", "/desenvolvedor", "/admin"]);
  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter(
      (href) =>
        pathname === href ||
        (!rootHrefs.has(href) && pathname.startsWith(href + "/"))
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border/60"
      >
        <Image
          src="/logo.png"
          alt="TATICCA Pipeline"
          width={28}
          height={28}
          className="rounded"
        />
        <span className="text-sm font-semibold tracking-tight">
          TATICCA{" "}
          <span className="text-muted-foreground/80 font-normal">Pipeline</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="border-t border-sidebar-border/60 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
                aria-label="Abrir menu do usuário"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {user.email}
                  </p>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56"
              align="end"
              side="top"
              sideOffset={8}
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              {isSuperAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    <Shield className="mr-2 inline h-3.5 w-3.5" />
                    Ver como
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      viewAsAdmin();
                      router.push("/admin");
                    }}
                  >
                    Admin
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      viewAsDeveloper();
                      router.push("/desenvolvedor");
                    }}
                  >
                    Desenvolvedor
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setClientPickerOpen(true)}>
                    Cliente...
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isSuperAdmin && (
        <ClientPickerDialog
          open={clientPickerOpen}
          onOpenChange={setClientPickerOpen}
          onSelect={(client) => {
            viewAsClient(client);
            router.push("/cliente");
          }}
        />
      )}
    </aside>
  );
}
