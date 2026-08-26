import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User as SelectUser, Company, insertUserSchema } from "@shared/schema";
import { queryClient, getQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";


type AuthContextType = {
  user: SelectUser | null;
  company: Company | null;
  isLoading: boolean;
  isMaintenanceMode: boolean;
  isLoadingMaintenance: boolean;
  error: Error | null;
  isImpersonating: boolean;
  loginMutation: any;
  adminLoginMutation: any;
  logoutMutation: any;
  registerMutation: any;
  impersonateCompanyMutation: any;
  returnFromImpersonationMutation: any;
};

type LoginData = {
  username: string;
  password: string;
};

const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterData = z.infer<typeof registerSchema>;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();


  const isOnAuthPage = window.location.pathname === '/auth' || 
                      window.location.pathname === '/login' || 
                      window.location.pathname === '/register';

  const {
    data: user,
    error,
    isLoading: isLoadingUser,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ['/api/user'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !isOnAuthPage, // Don't run on auth pages
  });

  const {
    data: company,
    isLoading: isLoadingCompany,
  } = useQuery<Company | null, Error>({
    queryKey: ['/api/user/with-company'],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/user/with-company");
        if (!res.ok) return null;
        const data = await res.json();
        return data.company;
      } catch (error) {
        console.error("Error fetching company data:", error);
        return null;
      }
    },
    enabled: !!user && !!user.companyId && !user.isSuperAdmin,
  });



  const isImpersonating = !!(user?.companyId && !user?.isSuperAdmin &&
    (sessionStorage.getItem('isImpersonating') === 'true' || localStorage.getItem('isImpersonating') === 'true'));

  const isLoading = isLoadingUser || isLoadingCompany;



  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Invalid credentials");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(['/api/user'], user);
      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.fullName}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const adminLoginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/admin/login", credentials);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Invalid admin credentials");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(['/api/user'], user);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });

      toast({
        title: "Admin login successful",
        description: `Welcome back, ${user.fullName}!`,
      });

      setTimeout(() => {
        window.location.href = '/admin/dashboard';
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Admin login failed",
        description: error.message || "Invalid admin credentials",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const { confirmPassword, ...userData } = data;
      const res = await apiRequest("POST", "/api/register", userData);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(['/api/user'], user);
      toast({
        title: "Registration successful",
        description: `Welcome, ${user.fullName}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
      sessionStorage.removeItem('isImpersonating');
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['/api/user'], null);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });

      setTimeout(() => {
        window.location.href = '/auth';
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const impersonateCompanyMutation = useMutation({
    mutationFn: async (companyId: number) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${companyId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to impersonate company");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      sessionStorage.setItem('isImpersonating', 'true');
      localStorage.setItem('isImpersonating', 'true');

      localStorage.setItem('originalSuperAdminId', data.originalUserId?.toString() || '');

      queryClient.clear();
      queryClient.setQueryData(['/api/user'], data.user);
      queryClient.setQueryData(['/api/user/with-company'], { company: data.company });

      toast({
        title: "Company impersonation active",
        description: `You are now logged in as ${data.user.fullName}`,
      });

      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Impersonation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const returnFromImpersonationMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await fetch("/api/admin/return-from-impersonation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (!res.ok) {
          let errorMessage = "Failed to return from impersonation";
          try {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            
            errorMessage = `Server error (${res.status}): ${res.statusText}`;
          }
          throw new Error(errorMessage);
        }

        try {
          return await res.json();
        } catch (parseError) {
          
          return {
            user: null,
            impersonating: false,
            message: "Returned to admin account (response parsing failed)"
          };
        }
      } catch (networkError) {
        console.error("Network error during return from impersonation:", networkError);
        throw new Error("Network error: Could not connect to server");
      }
    },
    onSuccess: (data) => {
      sessionStorage.removeItem('isImpersonating');
      localStorage.removeItem('isImpersonating');
      localStorage.removeItem('originalSuperAdminId');

      queryClient.clear();

      if (data.user) {
        queryClient.setQueryData(['/api/user'], data.user);
      }

      toast({
        title: "Returned to admin account",
        description: data.message || "You are now logged in as super admin",
      });

      setTimeout(() => {
        window.location.replace('/admin/dashboard');
      }, 1000);
    },
    onError: (error: Error) => {
      sessionStorage.removeItem('isImpersonating');
      localStorage.removeItem('isImpersonating');
      localStorage.removeItem('originalSuperAdminId');

      toast({
        title: "Failed to return to admin account",
        description: error.message + " - Redirecting to admin login",
        variant: "destructive",
      });

      setTimeout(() => {
        queryClient.clear();
        sessionStorage.clear();
        localStorage.clear();
        window.location.replace('/admin/login');
      }, 2000);
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        company: company ?? null,
        isLoading,
        isMaintenanceMode: false,
        isLoadingMaintenance: false,
        error,
        isImpersonating,
        loginMutation,
        adminLoginMutation,
        logoutMutation,
        registerMutation,
        impersonateCompanyMutation,
        returnFromImpersonationMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}