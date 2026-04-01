// ============================================
// SEARCH RESULTS PAGE - COMPLETELY FIXED
// ============================================

console.log('📊 Search Results loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SearchResults = {
    currentUser: null,
    query: '',
    category: '',
    videos: [],
    currentPage: 1,
    itemsPerPage: 10,
    hasMore: true,
    isLoading: false,
    currentVideoIndex: 0,
    videoElements: [],
    likes: new Set(),
    filters: {
        category: 'all',
        duration: 'all',
        date: 'all',
        verified: false,
        featured: false,
        sort: 'relevance'
    },
    
    async init() {
        try {
            await this.checkAuth();
            this.getUrlParams();
            this.setupEventListeners();
            await this.searchVideos();
            
            console.log('✅ Search Results ready');
        } catch (error) {
            console.error('Error initializing:', error);
            this.showToast('Error loading results', 'error');
        }
    },
    
    async checkAuth() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            this.currentUser = user;
        } catch (error) {
            console.error('Auth check error:', error);
        }
    },
    
    getUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        this.query = urlParams.get('q') || '';
        this.category = urlParams.get('category') || '';
        
        const searchInput = document.getElementById('searchInput');
        const searchQuery = document.getElementById('searchQuery');
        
        if (searchInput) searchInput.value = this.query;
        if (searchQuery) searchQuery.textContent = this.query || this.category || 'all';
        
        if (this.category) {
            const categoryFilter = document.getElementById('categoryFilter');
            if (categoryFilter) categoryFilter.value = this.category;
        }
    },
    
    async loadUserLikes() {
        if (!this.currentUser) return;
        
        try {
            const { data, error } = await sb
                .from('video_likes')
                .select('video_id')
                .eq('user_id', this.currentUser.id);
            
            if (error) throw error;
            
            this.likes = new Set(data.map(like => like.video_id));
        } catch (error) {
            console.error('Error loading likes:', error);
        }
    },
    
    // ============================================
    // FIXED: Correct Supabase query with proper joins
    // ============================================
    async searchVideos(reset = true) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        const loadingEl = document.getElementById('loadingState');
        const feedContainer = document.getElementById('feedContainer');
        const emptyEl = document.getElementById('emptyState');
        const loadMoreEl = document.getElementById('loadMore');
        
        if (reset) {
            this.currentPage = 1;
            this.hasMore = true;
            
            if (loadingEl) loadingEl.style.display = 'block';
            if (feedContainer) feedContainer.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'none';
            if (loadMoreEl) loadMoreEl.style.display = 'none';
            
            this.videoElements = [];
        }
        
        try {
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            
            // First, get all videos with their relations
            let query = sb
                .from('product_videos')
                .select(`
                    *,
                    supplier:suppliers!product_videos_supplier_id_fkey (
                        id,
                        business_name,
                        profile:profiles!suppliers_profile_id_fkey (
                            avatar_url
                        )
                    ),
                    product:ads!product_videos_product_id_fkey (
                        id,
                        title,
                        price,
                        currency
                    )
                `)
                .eq('is_active', true);
            
            // Apply category filter first (this is on the product_videos table)
            if (this.filters.category && this.filters.category !== 'all') {
                query = query.eq('category', this.filters.category);
            } else if (this.category && this.category !== 'all') {
                query = query.eq('category', this.category);
            }
            
            // Execute the query to get all matching videos
            const { data: allVideos, error } = await query;
            
            if (error) {
                console.error('Supabase query error:', error);
                throw error;
            }
            
            // Now filter the results in JavaScript based on search query
            let filteredVideos = allVideos || [];
            
            if (this.query) {
                const searchLower = this.query.toLowerCase();
                filteredVideos = filteredVideos.filter(video => {
                    // Search in caption
                    if (video.caption && video.caption.toLowerCase().includes(searchLower)) {
                        return true;
                    }
                    // Search in product title
                    if (video.product?.title && video.product.title.toLowerCase().includes(searchLower)) {
                        return true;
                    }
                    // Search in supplier name
                    if (video.supplier?.business_name && video.supplier.business_name.toLowerCase().includes(searchLower)) {
                        return true;
                    }
                    return false;
                });
            }
            
            // Apply duration filter
            if (this.filters.duration && this.filters.duration !== 'all') {
                filteredVideos = filteredVideos.filter(video => {
                    const duration = video.duration || 0;
                    if (this.filters.duration === 'short') {
                        return duration < 30;
                    } else if (this.filters.duration === 'medium') {
                        return duration >= 30 && duration < 60;
                    } else if (this.filters.duration === 'long') {
                        return duration >= 60;
                    }
                    return true;
                });
            }
            
            // Apply date filter
            if (this.filters.date && this.filters.date !== 'all') {
                const now = new Date();
                let startDate = new Date();
                
                if (this.filters.date === 'today') {
                    startDate.setHours(0, 0, 0, 0);
                } else if (this.filters.date === 'week') {
                    startDate.setDate(now.getDate() - 7);
                } else if (this.filters.date === 'month') {
                    startDate.setMonth(now.getMonth() - 1);
                } else if (this.filters.date === 'year') {
                    startDate.setFullYear(now.getFullYear() - 1);
                }
                
                filteredVideos = filteredVideos.filter(video => {
                    const createdDate = new Date(video.created_at);
                    return createdDate >= startDate;
                });
            }
            
            // Apply sorting
            if (this.filters.sort === 'latest') {
                filteredVideos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            } else if (this.filters.sort === 'popular' || this.filters.sort === 'viewed') {
                filteredVideos.sort((a, b) => (b.views || 0) - (a.views || 0));
            } else if (this.filters.sort === 'liked') {
                filteredVideos.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            } else {
                filteredVideos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
            
            // Apply pagination
            const paginatedVideos = filteredVideos.slice(from, to + 1);
            
            console.log('Search results:', paginatedVideos.length, 'videos found');
            
            // Load user likes
            if (this.currentUser) {
                await this.loadUserLikes();
            }
            
            // Mark liked videos
            paginatedVideos.forEach(video => {
                video.liked = this.likes.has(video.id);
            });
            
            if (reset) {
                this.videos = paginatedVideos;
            } else {
                this.videos = [...this.videos, ...paginatedVideos];
            }
            
            this.hasMore = filteredVideos.length > to + 1;
            
            this.renderVideos(reset);
            this.updateResultsCount();
            
            if (loadingEl) loadingEl.style.display = 'none';
            
            if (emptyEl) {
                emptyEl.style.display = this.videos.length === 0 ? 'block' : 'none';
            }
            
            if (loadMoreEl) {
                loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
            }
            
        } catch (error) {
            console.error('Error searching videos:', error);
            this.showToast('Error searching videos: ' + (error.message || 'Unknown error'), 'error');
        } finally {
            this.isLoading = false;
        }
    },
    
    renderVideos(reset) {
        const container = document.getElementById('feedContainer');
        if (!container) return;
        
        if (reset) {
            container.innerHTML = '';
            this.videoElements = [];
        }
        
        const startIndex = reset ? 0 : this.videoElements.length;
        
        this.videos.slice(startIndex).forEach((video, index) => {
            const videoElement = this.createVideoElement(video);
            container.appendChild(videoElement);
            this.videoElements.push(videoElement);
        });
        
        if (reset) {
            this.setupIntersectionObserver();
        }
    },
    
    createVideoElement(video) {
        const div = document.createElement('div');
        div.className = 'video-item';
        div.dataset.videoId = video.id;
        
        const supplierName = video.supplier?.business_name || 'Supplier';
        const supplierInitial = supplierName.charAt(0).toUpperCase();
        const avatarUrl = video.supplier?.profile?.avatar_url;
        const productTitle = video.product?.title || 'Product';
        
        div.innerHTML = `
            <div class="video-wrapper">
                <video loop playsinline muted preload="metadata" poster="${video.thumbnail_url || ''}">
                    <source src="${video.video_url}" type="video/mp4">
                </video>
                
                <div class="video-overlay"></div>
                
                <div class="play-indicator">
                    <i class="fas fa-play"></i>
                </div>
                
                <button class="unmute-btn" onclick="SearchResults.toggleMute(this, ${video.id})">
                    <i class="fas fa-volume-mute"></i>
                </button>
                
                <div class="sound-wave hide">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                
                <div class="video-info">
                    <div class="supplier-info" onclick="SearchResults.viewSupplier('${video.supplier?.id}')">
                        ${avatarUrl 
                            ? `<img src="${avatarUrl}" class="supplier-avatar">`
                            : `<div class="supplier-avatar">${supplierInitial}</div>`
                        }
                        <span class="supplier-name">${this.escapeHtml(supplierName)}</span>
                    </div>
                    
                    <div class="product-name">${this.escapeHtml(productTitle)}</div>
                    
                    <div class="video-caption">${this.escapeHtml(video.caption || '')}</div>
                    
                    <button class="inquiry-btn" onclick="SearchResults.sendInquiry(${video.id}, '${video.supplier?.id}', ${video.product?.id})">
                        <i class="fas fa-comment-dots"></i>
                        Send Inquiry
                    </button>
                </div>
                
                <div class="action-buttons">
                    <div class="action-btn ${video.liked ? 'liked' : ''}" onclick="SearchResults.toggleLike(${video.id})">
                        <i class="fas fa-heart"></i>
                        <span class="like-count">${video.likes || 0}</span>
                    </div>
                    
                    <div class="action-btn" onclick="SearchResults.openComments(${video.id})">
                        <i class="fas fa-comment"></i>
                        <span>${video.comments || 0}</span>
                    </div>
                    
                    <div class="action-btn" onclick="SearchResults.shareVideo(${video.id})">
                        <i class="fas fa-share"></i>
                    </div>
                </div>
            </div>
        `;
        
        return div;
    },
    
    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.7
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = this.videoElements.indexOf(entry.target);
                    if (index !== -1) {
                        this.playVideo(index);
                        
                        if (index >= this.videoElements.length - 3) {
                            this.loadMoreResults();
                        }
                    }
                } else {
                    const video = entry.target.querySelector('video');
                    if (video) {
                        video.pause();
                    }
                }
            });
        }, options);
        
        this.videoElements.forEach(video => observer.observe(video));
    },
    
    playVideo(index) {
        this.videoElements.forEach((el, i) => {
            const video = el.querySelector('video');
            if (video && i !== index) {
                video.pause();
            }
        });
        
        const currentElement = this.videoElements[index];
        if (currentElement) {
            const video = currentElement.querySelector('video');
            if (video) {
                video.muted = true;
                
                const playPromise = video.play();
                
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            this.currentVideoIndex = index;
                            
                            const playIndicator = currentElement.querySelector('.play-indicator');
                            if (playIndicator) {
                                playIndicator.classList.remove('show');
                            }
                            
                            currentElement.classList.add('playing');
                            
                            const unmuteBtn = currentElement.querySelector('.unmute-btn i');
                            if (unmuteBtn) {
                                unmuteBtn.className = 'fas fa-volume-mute';
                            }
                        })
                        .catch(error => {
                            console.log('Autoplay failed:', error);
                            
                            const playIndicator = currentElement.querySelector('.play-indicator');
                            if (playIndicator) {
                                playIndicator.classList.add('show');
                            }
                            
                            currentElement.classList.remove('playing');
                            
                            const playVideoOnClick = () => {
                                video.play()
                                    .then(() => {
                                        if (playIndicator) {
                                            playIndicator.classList.remove('show');
                                        }
                                        currentElement.classList.add('playing');
                                        video.removeEventListener('click', playVideoOnClick);
                                    })
                                    .catch(e => console.log('Still cannot play:', e));
                            };
                            
                            video.addEventListener('click', playVideoOnClick, { once: true });
                        });
                }
                
                if (this.videos[index]) {
                    this.trackView(this.videos[index].id);
                }
            }
        }
    },
    
    async trackView(videoId) {
        if (!this.currentUser) return;
        
        try {
            await sb
                .from('video_views')
                .insert({
                    video_id: videoId,
                    user_id: this.currentUser.id,
                    viewed_at: new Date().toISOString()
                });
        } catch (error) {
            console.error('Error tracking view:', error);
        }
    },
    
    toggleMute(button, videoId) {
        const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
        if (!videoElement) return;
        
        const video = videoElement.querySelector('video');
        if (!video) return;
        
        const soundWave = videoElement.querySelector('.sound-wave');
        
        video.muted = !video.muted;
        
        const icon = button.querySelector('i');
        if (video.muted) {
            icon.className = 'fas fa-volume-mute';
            if (soundWave) soundWave.classList.add('hide');
        } else {
            icon.className = 'fas fa-volume-up';
            if (soundWave) soundWave.classList.remove('hide');
        }
        
        if (!video.muted && video.paused) {
            video.play().catch(e => console.log('Play failed:', e));
        }
        
        if (!video.muted) {
            this.showToast('Sound on', 'info');
        }
    },
    
    async toggleLike(videoId) {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', 'search-results.html');
            sessionStorage.setItem('pendingLike', videoId);
            window.location.href = 'login.html?redirect=search-results.html';
            return;
        }
        
        try {
            const video = this.videos.find(v => v.id === videoId);
            const isLiked = this.likes.has(videoId);
            
            if (isLiked) {
                const { error } = await sb
                    .from('video_likes')
                    .delete()
                    .eq('video_id', videoId)
                    .eq('user_id', this.currentUser.id);
                
                if (error) throw error;
                
                this.likes.delete(videoId);
                video.likes = Math.max(0, (video.likes || 1) - 1);
            } else {
                const { error } = await sb
                    .from('video_likes')
                    .insert({
                        video_id: videoId,
                        user_id: this.currentUser.id,
                        created_at: new Date().toISOString()
                    });
                
                if (error) throw error;
                
                this.likes.add(videoId);
                video.likes = (video.likes || 0) + 1;
            }
            
            video.liked = !isLiked;
            this.updateLikeButton(videoId);
            
            const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
            if (videoElement && !isLiked) {
                const heartIcon = videoElement.querySelector('.action-btn:first-child i');
                heartIcon.classList.add('heart-pop');
                setTimeout(() => heartIcon.classList.remove('heart-pop'), 300);
            }
            
        } catch (error) {
            console.error('Error toggling like:', error);
            this.showToast('Error updating like', 'error');
        }
    },
    
    updateLikeButton(videoId) {
        const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
        if (videoElement) {
            const likeBtn = videoElement.querySelector('.action-btn:first-child');
            const likeCount = videoElement.querySelector('.like-count');
            const video = this.videos.find(v => v.id === videoId);
            
            if (likeBtn) likeBtn.classList.toggle('liked', video.liked);
            if (likeCount) likeCount.textContent = video.likes || 0;
        }
    },
    
    async openComments(videoId) {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', 'search-results.html');
            sessionStorage.setItem('pendingComment', videoId);
            window.location.href = 'login.html?redirect=search-results.html';
            return;
        }
        
        this.currentCommentVideoId = videoId;
        
        try {
            const { data, error } = await sb
                .from('video_comments')
                .select(`
                    *,
                    user:profiles!video_comments_user_id_fkey (
                        id,
                        full_name,
                        avatar_url
                    )
                `)
                .eq('video_id', videoId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            const commentsList = document.getElementById('commentsList');
            const commentCount = document.getElementById('commentCount');
            
            if (commentCount) commentCount.textContent = data.length;
            
            if (commentsList) {
                if (data.length === 0) {
                    commentsList.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--gray-500);">No comments yet. Be the first to comment!</div>';
                } else {
                    commentsList.innerHTML = data.map(comment => {
                        const userName = comment.user?.full_name || 'User';
                        const userInitial = userName.charAt(0).toUpperCase();
                        const avatarUrl = comment.user?.avatar_url;
                        
                        return `
                            <div class="comment-item">
                                <div class="comment-avatar">
                                    ${avatarUrl 
                                        ? `<img src="${avatarUrl}">`
                                        : userInitial
                                    }
                                </div>
                                <div class="comment-content">
                                    <div class="comment-name">${this.escapeHtml(userName)}</div>
                                    <div class="comment-text">${this.escapeHtml(comment.comment)}</div>
                                    <div class="comment-time">${this.timeAgo(comment.created_at)}</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
            
            setTimeout(() => {
                document.getElementById('commentInput')?.focus();
            }, 300);
            
            document.getElementById('commentsModal')?.classList.add('show');
            
        } catch (error) {
            console.error('Error loading comments:', error);
            this.showToast('Error loading comments', 'error');
        }
    },
    
    async addComment() {
        if (!this.currentUser) {
            window.location.href = 'login.html?redirect=search-results.html';
            return;
        }
        
        const input = document.getElementById('commentInput');
        if (!input) return;
        
        const comment = input.value.trim();
        if (!comment) return;
        
        input.disabled = true;
        
        try {
            const { error } = await sb
                .from('video_comments')
                .insert({
                    video_id: this.currentCommentVideoId,
                    user_id: this.currentUser.id,
                    comment: comment,
                    created_at: new Date().toISOString()
                });
            
            if (error) throw error;
            
            input.value = '';
            this.showToast('Comment added', 'success');
            await this.openComments(this.currentCommentVideoId);
            
            const video = this.videos.find(v => v.id === this.currentCommentVideoId);
            if (video) {
                video.comments = (video.comments || 0) + 1;
                this.updateCommentCount(video.id);
            }
            
        } catch (error) {
            console.error('Error adding comment:', error);
            this.showToast('Error adding comment', 'error');
        } finally {
            input.disabled = false;
        }
    },
    
    updateCommentCount(videoId) {
        const videoElement = this.videoElements.find(el => el.dataset.videoId == videoId);
        if (videoElement) {
            const commentBtn = videoElement.querySelectorAll('.action-btn')[1];
            const commentCount = commentBtn?.querySelector('span');
            const video = this.videos.find(v => v.id === videoId);
            
            if (commentCount) commentCount.textContent = video.comments || 0;
        }
    },
    
    sendInquiry(videoId, supplierId, productId) {
        if (!this.currentUser) {
            sessionStorage.setItem('redirectAfterLogin', 'search-results.html');
            sessionStorage.setItem('pendingInquiry', JSON.stringify({ videoId, supplierId, productId }));
            window.location.href = 'login.html?redirect=search-results.html';
            return;
        }
        
        sb.from('video_inquiries').insert({
            video_id: videoId,
            user_id: this.currentUser.id,
            created_at: new Date().toISOString()
        }).then();
        
        this.showToast('Opening chat...', 'info');
        
        setTimeout(() => {
            window.location.href = `chat.html?supplier=${supplierId}&product=${productId}&from=video`;
        }, 500);
    },
    
    shareVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId);
        const url = window.location.href.split('?')[0] + '?video=' + videoId;
        const title = video?.product?.title || 'Check out this product';
        
        if (navigator.share) {
            navigator.share({
                title: title,
                text: video?.caption || 'Check out this product on iBlue B2B',
                url: url
            }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url);
            this.showToast('Link copied to clipboard', 'success');
        }
    },
    
    viewSupplier(supplierId) {
        window.location.href = `supplier-profile.html?id=${supplierId}`;
    },
    
    timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';
        return date.toLocaleDateString();
    },
    
    updateResultsCount() {
        const countEl = document.getElementById('resultsCount');
        if (countEl) {
            countEl.textContent = `${this.videos.length} video${this.videos.length !== 1 ? 's' : ''}`;
        }
    },
    
    applyFilters() {
        this.filters.category = document.getElementById('categoryFilter')?.value || 'all';
        this.filters.duration = document.getElementById('durationFilter')?.value || 'all';
        this.filters.date = document.getElementById('dateFilter')?.value || 'all';
        this.filters.verified = document.getElementById('verifiedFilter')?.checked || false;
        this.filters.featured = document.getElementById('featuredFilter')?.checked || false;
        this.filters.sort = document.getElementById('sortFilter')?.value || 'relevance';
        
        this.closeFilterPanel();
        this.searchVideos(true);
        this.showToast('Filters applied', 'success');
    },
    
    resetFilters() {
        const categoryFilter = document.getElementById('categoryFilter');
        const durationFilter = document.getElementById('durationFilter');
        const dateFilter = document.getElementById('dateFilter');
        const verifiedFilter = document.getElementById('verifiedFilter');
        const featuredFilter = document.getElementById('featuredFilter');
        const sortFilter = document.getElementById('sortFilter');
        
        if (categoryFilter) categoryFilter.value = 'all';
        if (durationFilter) durationFilter.value = 'all';
        if (dateFilter) dateFilter.value = 'all';
        if (verifiedFilter) verifiedFilter.checked = false;
        if (featuredFilter) featuredFilter.checked = false;
        if (sortFilter) sortFilter.value = 'relevance';
        
        this.filters = {
            category: 'all',
            duration: 'all',
            date: 'all',
            verified: false,
            featured: false,
            sort: 'relevance'
        };
        
        this.closeFilterPanel();
        this.searchVideos(true);
        this.showToast('Filters reset', 'info');
    },
    
    toggleFilterPanel() {
        const panel = document.getElementById('filterPanel');
        const btn = document.getElementById('filterToggleBtn');
        
        if (panel) {
            panel.classList.toggle('show');
            if (btn) btn.classList.toggle('active');
        }
    },
    
    closeFilterPanel() {
        const panel = document.getElementById('filterPanel');
        const btn = document.getElementById('filterToggleBtn');
        
        if (panel) {
            panel.classList.remove('show');
            if (btn) btn.classList.remove('active');
        }
    },
    
    changeSort(sortBy) {
        this.filters.sort = sortBy;
        
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === sortBy);
        });
        
        this.searchVideos(true);
    },
    
    loadMoreResults() {
        if (!this.hasMore || this.isLoading) return;
        
        this.currentPage++;
        this.searchVideos(false);
    },
    
    trySuggestion(suggestion) {
        window.location.href = `search-results.html?q=${encodeURIComponent(suggestion)}`;
    },
    
    showToast(message, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    closeComments() {
        document.getElementById('commentsModal')?.classList.remove('show');
    },
    
    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.query = searchInput.value;
                    document.getElementById('searchQuery').textContent = this.query;
                    this.searchVideos(true);
                }
            });
        }
        
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                if (filter) {
                    this.changeSort(filter);
                }
            });
        });
        
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('filterPanel');
            const btn = document.getElementById('filterToggleBtn');
            
            if (panel && btn && panel.classList.contains('show') && 
                !panel.contains(e.target) && !btn.contains(e.target)) {
                this.closeFilterPanel();
            }
        });
        
        const backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }
        
        document.getElementById('commentsModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('commentsModal')) {
                this.closeComments();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeComments();
                this.closeFilterPanel();
            }
        });
        
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                const videoItem = e.target.closest('.video-item');
                if (videoItem) {
                    const videoId = videoItem.dataset.videoId;
                    if (videoId) {
                        const heartIcon = videoItem.querySelector('.action-btn:first-child i');
                        heartIcon.classList.add('heart-pop');
                        setTimeout(() => heartIcon.classList.remove('heart-pop'), 300);
                        
                        this.toggleLike(parseInt(videoId));
                    }
                }
            }
            lastTap = now;
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = Math.max(0, this.currentVideoIndex - 1);
                if (this.videoElements[prevIndex]) {
                    this.videoElements[prevIndex].scrollIntoView({ behavior: 'smooth' });
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = Math.min(this.videoElements.length - 1, this.currentVideoIndex + 1);
                if (this.videoElements[nextIndex]) {
                    this.videoElements[nextIndex].scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }
};

// Global functions
window.SearchResults = SearchResults;
window.toggleFilterPanel = () => SearchResults.toggleFilterPanel();
window.applyFilters = () => SearchResults.applyFilters();
window.resetFilters = () => SearchResults.resetFilters();
window.loadMoreResults = () => SearchResults.loadMoreResults();
window.trySuggestion = (suggestion) => SearchResults.trySuggestion(suggestion);
window.addComment = () => SearchResults.addComment();
window.closeComments = () => SearchResults.closeComments();
window.toggleMute = (button, videoId) => SearchResults.toggleMute(button, videoId);
window.sendInquiry = (videoId, supplierId, productId) => SearchResults.sendInquiry(videoId, supplierId, productId);
window.viewSupplier = (id) => SearchResults.viewSupplier(id);
window.openComments = (id) => SearchResults.openComments(id);
window.shareVideo = (id) => SearchResults.shareVideo(id);

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SearchResults.init());
} else {
    SearchResults.init();
}