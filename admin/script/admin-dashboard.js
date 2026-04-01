// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Dashboard Manager Object
const DashboardManager = {
    charts: {
        adsChart: null,
        usersChart: null
    },

    // Initialize on page load
    init: async function() {
        await this.checkAdminAuth();
        await this.loadDashboardData();
        this.setupRealtimeSubscription();
    },

    // Check admin authentication
    checkAdminAuth: async function() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) {
                window.location.href = 'admin-login.html';
                return;
            }

            const { data: profile } = await sb
                .from('profiles')
                .select('full_name, is_admin, admin_role')
                .eq('id', user.id)
                .single();

            if (!profile?.is_admin) {
                window.location.href = 'index.html';
                return;
            }

            // Display admin name
            const adminNameElement = document.getElementById('adminName');
            if (adminNameElement) {
                adminNameElement.textContent = profile.full_name || 'Admin';
            }

        } catch (error) {
            console.error('Auth check error:', error);
            this.showToast('Authentication error', 'error');
        }
    },

    // Load dashboard data
    loadDashboardData: async function() {
        try {
            // Show loading states
            this.showLoading();

            // Load all data in parallel
            const [
                statsData,
                recentActivity,
                adsChartData,
                usersChartData
            ] = await Promise.all([
                this.getStatsData(),
                this.getRecentActivity(),
                this.getAdsChartData(),
                this.getUsersChartData()
            ]);

            // Update UI
            this.updateStats(statsData);
            this.updateRecentActivity(recentActivity);
            this.createAdsChart(adsChartData);
            this.createUsersChart(usersChartData);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showToast('Error loading dashboard data', 'error');
        }
    },

    // Get stats data
    getStatsData: async function() {
        try {
            // Get current date for comparisons
            const now = new Date();
            const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).toISOString();
            const sixtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).toISOString();

            // Get total ads
            const { count: totalAds, error: adsError } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true });

            // Get ads from last 30 days
            const { count: recentAds, error: recentAdsError } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', thirtyDaysAgo);

            // Get total users
            const { count: totalUsers, error: usersError } = await sb
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            // Get new users from last 30 days
            const { count: newUsers, error: newUsersError } = await sb
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', thirtyDaysAgo);

            // Get active ads (status = 'active')
            const { count: activeAds, error: activeAdsError } = await sb
                .from('ads')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');

            // Get pending reports
            const { count: pendingReports, error: reportsError } = await sb
                .from('reports')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            if (adsError || usersError || activeAdsError || reportsError) {
                throw new Error('Error fetching stats');
            }

            // Calculate trends (compare with previous 30 days)
            const previousAds = totalAds - (recentAds || 0);
            const adsTrend = previousAds > 0 ? ((recentAds - previousAds) / previousAds * 100).toFixed(1) : 0;

            const previousUsers = totalUsers - (newUsers || 0);
            const usersTrend = previousUsers > 0 ? ((newUsers - previousUsers) / previousUsers * 100).toFixed(1) : 0;

            return {
                totalAds: totalAds || 0,
                totalUsers: totalUsers || 0,
                activeAds: activeAds || 0,
                pendingReports: pendingReports || 0,
                recentAds: recentAds || 0,
                newUsers: newUsers || 0,
                adsTrend: adsTrend,
                usersTrend: usersTrend
            };

        } catch (error) {
            console.error('Error getting stats:', error);
            return {
                totalAds: 0,
                totalUsers: 0,
                activeAds: 0,
                pendingReports: 0,
                recentAds: 0,
                newUsers: 0,
                adsTrend: 0,
                usersTrend: 0
            };
        }
    },

    // Update stats UI
    updateStats: function(stats) {
        const statsGrid = document.getElementById('statsGrid');
        if (!statsGrid) return;

        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <h3>Total Ads</h3>
                    <div class="stat-icon blue">
                        <i class="fas fa-ad"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalAds.toLocaleString()}</div>
                <div class="stat-change ${stats.adsTrend >= 0 ? 'positive' : 'negative'}">
                    <i class="fas fa-${stats.adsTrend >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                    <span>${Math.abs(stats.adsTrend)}% from last month</span>
                </div>
                <small class="text-muted">${stats.recentAds} new this month</small>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <h3>Total Users</h3>
                    <div class="stat-icon green">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.totalUsers.toLocaleString()}</div>
                <div class="stat-change ${stats.usersTrend >= 0 ? 'positive' : 'negative'}">
                    <i class="fas fa-${stats.usersTrend >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                    <span>${Math.abs(stats.usersTrend)}% from last month</span>
                </div>
                <small class="text-muted">${stats.newUsers} new this month</small>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <h3>Active Ads</h3>
                    <div class="stat-icon yellow">
                        <i class="fas fa-eye"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.activeAds.toLocaleString()}</div>
                <small class="text-muted">${((stats.activeAds / stats.totalAds) * 100).toFixed(1)}% of total ads</small>
            </div>

            <div class="stat-card">
                <div class="stat-header">
                    <h3>Pending Reports</h3>
                    <div class="stat-icon red">
                        <i class="fas fa-flag"></i>
                    </div>
                </div>
                <div class="stat-value">${stats.pendingReports.toLocaleString()}</div>
                <small class="text-muted">Requires attention</small>
            </div>
        `;
    },

    // Get recent activity
    getRecentActivity: async function() {
        try {
            const { data: activities, error } = await sb
                .from('admin_actions')
                .select(`
                    *,
                    admin:admin_id (full_name),
                    target_ad:target_ad_id (title),
                    target_user:target_user_id (full_name),
                    target_category:target_category_id (name)
                `)
                .order('performed_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            return activities || [];

        } catch (error) {
            console.error('Error getting recent activity:', error);
            return [];
        }
    },

    // Update recent activity UI
    updateRecentActivity: function(activities) {
        const tbody = document.getElementById('activityBody');
        if (!tbody) return;

        if (!activities || activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">No recent activity</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = activities.map(activity => {
            const time = new Date(activity.performed_at).toLocaleString();
            let details = '';

            // Format details based on action type
            if (activity.target_ad) {
                details = `Ad: ${activity.target_ad?.title || 'N/A'}`;
            } else if (activity.target_user) {
                details = `User: ${activity.target_user?.full_name || 'N/A'}`;
            } else if (activity.target_category) {
                details = `Category: ${activity.target_category?.name || 'N/A'}`;
            }

            return `
                <tr>
                    <td>${time}</td>
                    <td>
                        <span class="action-badge ${activity.action_type.replace(/_/g, '_')}">
                            ${activity.action_type.replace(/_/g, ' ')}
                        </span>
                    </td>
                    <td>${activity.admin?.full_name || 'System'}</td>
                    <td>${details || activity.details || '-'}</td>
                </tr>
            `;
        }).join('');
    },

    // Get ads chart data
    getAdsChartData: async function() {
        try {
            const labels = [];
            const data = [];

            // Get last 7 days
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const startOfDay = new Date(date.setHours(0, 0, 0, 0)).toISOString();
                const endOfDay = new Date(date.setHours(23, 59, 59, 999)).toISOString();

                const { count, error } = await sb
                    .from('ads')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfDay)
                    .lte('created_at', endOfDay);

                if (error) throw error;

                labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                data.push(count || 0);
            }

            return { labels, data };

        } catch (error) {
            console.error('Error getting ads chart data:', error);
            return { labels: [], data: [] };
        }
    },

    // Create ads chart
    createAdsChart: function(chartData) {
        const ctx = document.getElementById('adsChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (this.charts.adsChart) {
            this.charts.adsChart.destroy();
        }

        this.charts.adsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'New Ads',
                    data: chartData.data,
                    borderColor: '#0B4F6C',
                    backgroundColor: 'rgba(11, 79, 108, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
    },

    // Get users chart data
    getUsersChartData: async function() {
        try {
            const labels = [];
            const data = [];

            // Get last 7 days
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const startOfDay = new Date(date.setHours(0, 0, 0, 0)).toISOString();
                const endOfDay = new Date(date.setHours(23, 59, 59, 999)).toISOString();

                const { count, error } = await sb
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfDay)
                    .lte('created_at', endOfDay);

                if (error) throw error;

                labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                data.push(count || 0);
            }

            return { labels, data };

        } catch (error) {
            console.error('Error getting users chart data:', error);
            return { labels: [], data: [] };
        }
    },

    // Create users chart
    createUsersChart: function(chartData) {
        const ctx = document.getElementById('usersChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (this.charts.usersChart) {
            this.charts.usersChart.destroy();
        }

        this.charts.usersChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'New Users',
                    data: chartData.data,
                    backgroundColor: '#10B981',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
    },

    // Show loading states
    showLoading: function() {
        const statsGrid = document.getElementById('statsGrid');
        const activityBody = document.getElementById('activityBody');

        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="loading" style="grid-column: 1/-1;">
                    <div class="loading-spinner">
                        <i class="fas fa-spinner spinner"></i>
                    </div>
                    <p>Loading dashboard data...</p>
                </div>
            `;
        }

        if (activityBody) {
            activityBody.innerHTML = `
                <tr>
                    <td colspan="4" class="loading">Loading recent activity...</td>
                </tr>
            `;
        }
    },

    // Setup realtime subscription for live updates
    setupRealtimeSubscription: function() {
        // Subscribe to admin_actions for live updates
        const subscription = sb
            .channel('admin_actions_changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'admin_actions' },
                (payload) => {
                    console.log('New admin action:', payload);
                    // Refresh recent activity when new action occurs
                    this.getRecentActivity().then(activities => {
                        this.updateRecentActivity(activities);
                    });
                }
            )
            .subscribe();

        // Store subscription for cleanup if needed
        this.subscription = subscription;
    },

    // Logout function
    logout: async function() {
        try {
            // Log the logout action
            const { data: { user } } = await sb.auth.getUser();
            if (user) {
                await sb
                    .from('admin_actions')
                    .insert([{
                        admin_id: user.id,
                        action_type: 'logout',
                        performed_at: new Date().toISOString()
                    }]);
            }

            // Sign out
            await sb.auth.signOut();
            window.location.href = 'admin-login.html';

        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Error logging out', 'error');
        }
    },

    // Show toast notification
    showToast: function(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // Escape HTML to prevent XSS
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = DashboardManager;
    DashboardManager.init();
});

// Make logout function globally accessible
window.logout = () => DashboardManager.logout();