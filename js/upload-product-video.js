// ============================================
// PRODUCT VIDEO UPLOAD - WITH 5MB SIZE LIMIT
// ============================================

console.log('🚀 Product Video Upload loading...');

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

// Constants
const MAX_DURATION = 25; // 25 seconds max
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

// Initialize Supabase
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const VideoUploader = {
    currentUser: null,
    supplier: null,
    products: [],
    selectedFile: null,
    videoDuration: 0,
    trimStart: 0,
    trimEnd: 25,
    
    async init() {
        try {
            await this.checkAuth();
            await this.loadSupplier();
            await this.loadProducts();
            this.setupEventListeners();
            this.checkUploadButton();
            console.log('✅ Ready for uploads');
        } catch (error) {
            console.error('❌ Error:', error);
            this.showToast('Error: ' + error.message, 'error');
        }
    },
    
    async checkAuth() {
        const { data: { user }, error } = await sb.auth.getUser();
        if (error || !user) {
            window.location.href = 'login.html?redirect=upload-product-video.html';
            return;
        }
        this.currentUser = user;
    },
    
    async loadSupplier() {
        const { data, error } = await sb
            .from('suppliers')
            .select('*')
            .eq('profile_id', this.currentUser.id)
            .single();
        
        if (error) throw new Error('Could not load supplier profile');
        this.supplier = data;
    },
    
    async loadProducts() {
        const { data, error } = await sb
            .from('ads')
            .select('id, title')
            .eq('supplier_id', this.supplier.id)
            .eq('status', 'active');
        
        if (error) throw new Error('Could not load products');
        
        this.products = data || [];
        const select = document.getElementById('productSelect');
        if (select) {
            select.innerHTML = '<option value="">-- Select a product --</option>' +
                this.products.map(p => `<option value="${p.id}">${this.escapeHtml(p.title)}</option>`).join('');
        }
    },
    
    setupEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const videoInput = document.getElementById('videoInput');
        
        if (uploadArea && videoInput) {
            uploadArea.addEventListener('click', () => videoInput.click());
            
            videoInput.addEventListener('change', (e) => {
                this.handleFileSelect(e.target.files[0]);
            });
            
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = 'var(--primary)';
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = 'var(--gray-300)';
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) this.handleFileSelect(file);
            });
        }
        
        const productSelect = document.getElementById('productSelect');
        if (productSelect) {
            productSelect.addEventListener('change', () => this.checkUploadButton());
        }
        
        // Trim range inputs
        const trimStart = document.getElementById('trimStart');
        const trimEnd = document.getElementById('trimEnd');
        
        if (trimStart && trimEnd) {
            trimStart.addEventListener('input', () => {
                this.trimStart = parseFloat(trimStart.value);
                trimEnd.min = this.trimStart + 1;
                document.getElementById('trimStartValue').textContent = this.formatTime(this.trimStart);
                this.updateTrimPreview();
            });
            
            trimEnd.addEventListener('input', () => {
                this.trimEnd = parseFloat(trimEnd.value);
                trimStart.max = this.trimEnd - 1;
                document.getElementById('trimEndValue').textContent = this.formatTime(this.trimEnd);
                this.updateTrimPreview();
            });
        }
    },
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    updateTrimPreview() {
        const duration = this.trimEnd - this.trimStart;
        const previewVideo = document.getElementById('previewVideo');
        
        if (previewVideo) {
            previewVideo.currentTime = this.trimStart;
        }
        
        // Update trim info
        const trimInfo = document.getElementById('trimInfo');
        if (trimInfo) {
            trimInfo.textContent = `Selected: ${this.formatTime(this.trimStart)} - ${this.formatTime(this.trimEnd)} (${duration}s)`;
        }
        
        // Warn if too long
        if (duration > MAX_DURATION) {
            this.showToast(`Video must be ${MAX_DURATION} seconds or less`, 'warning');
        }
    },
    
    handleFileSelect(file) {
        if (!file) return;
        
        console.log('File selected:', file.name, this.formatFileSize(file.size));
        
        if (!file.type.startsWith('video/')) {
            this.showToast('Please select a video file', 'error');
            return;
        }
        
        // Check file size against 5MB limit
        if (file.size > MAX_FILE_SIZE) {
            this.showToast(`File too large: ${this.formatFileSize(file.size)}. Maximum allowed is 5MB.`, 'error');
            
            // Reset the file input
            document.getElementById('videoInput').value = '';
            return;
        }
        
        this.selectedFile = file;
        
        const preview = document.getElementById('videoPreview');
        const previewVideo = document.getElementById('previewVideo');
        const uploadArea = document.getElementById('uploadArea');
        const fileInfo = document.getElementById('fileInfo');
        const originalSize = document.getElementById('originalSize');
        const trimControls = document.getElementById('trimControls');
        
        if (preview && previewVideo && uploadArea) {
            if (previewVideo.src) {
                URL.revokeObjectURL(previewVideo.src);
            }
            
            previewVideo.src = URL.createObjectURL(file);
            preview.style.display = 'block';
            uploadArea.style.display = 'none';
            
            if (fileInfo) {
                fileInfo.classList.add('show');
            }
            
            if (originalSize) {
                originalSize.textContent = this.formatFileSize(file.size);
                
                // Add warning if file is close to limit
                if (file.size > MAX_FILE_SIZE * 0.8) {
                    originalSize.innerHTML += ' ⚠️ Near 5MB limit';
                }
            }
            
            previewVideo.onloadedmetadata = () => {
                this.videoDuration = Math.round(previewVideo.duration);
                
                // Setup trim controls
                if (trimControls) {
                    trimControls.style.display = 'block';
                    
                    const trimStart = document.getElementById('trimStart');
                    const trimEnd = document.getElementById('trimEnd');
                    
                    if (trimStart && trimEnd) {
                        trimStart.max = this.videoDuration - 1;
                        trimEnd.max = this.videoDuration;
                        trimEnd.value = Math.min(MAX_DURATION, this.videoDuration);
                        trimEnd.max = this.videoDuration;
                        
                        this.trimStart = 0;
                        this.trimEnd = Math.min(MAX_DURATION, this.videoDuration);
                        
                        document.getElementById('trimStartValue').textContent = this.formatTime(0);
                        document.getElementById('trimEndValue').textContent = this.formatTime(this.trimEnd);
                        document.getElementById('totalDuration').textContent = this.formatTime(this.videoDuration);
                        
                        this.updateTrimPreview();
                    }
                }
                
                // Show warning if video is too long
                if (this.videoDuration > MAX_DURATION) {
                    this.showToast(`Video is ${this.videoDuration}s. Will trim to ${MAX_DURATION}s.`, 'warning');
                }
            };
        }
        
        this.checkUploadButton();
    },
    
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    },
    
    checkUploadButton() {
        const uploadBtn = document.getElementById('uploadBtn');
        const productSelect = document.getElementById('productSelect');
        
        if (uploadBtn) {
            const hasVideo = this.selectedFile !== null;
            const hasProduct = productSelect && productSelect.value !== '';
            uploadBtn.disabled = !(hasVideo && hasProduct);
        }
    },
    
    // Simple thumbnail generation
    async generateThumbnail(file, timeInSeconds) {
        return new Promise((resolve, reject) => {
            try {
                console.log('Generating thumbnail...');
                
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.src = URL.createObjectURL(file);
                video.muted = true;
                video.playsInline = true;
                
                let isResolved = false;
                const videoUrl = video.src;
                
                const timeout = setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        URL.revokeObjectURL(videoUrl);
                        reject(new Error('Thumbnail generation timeout'));
                    }
                }, 5000);
                
                video.onloadedmetadata = () => {
                    if (isResolved) return;
                    
                    try {
                        const seekTime = Math.min(timeInSeconds, Math.max(0, video.duration - 0.5));
                        video.currentTime = seekTime;
                        
                        video.onseeked = () => {
                            if (isResolved) return;
                            
                            const canvas = document.createElement('canvas');
                            canvas.width = video.videoWidth || 320;
                            canvas.height = video.videoHeight || 240;
                            const ctx = canvas.getContext('2d');
                            
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            
                            canvas.toBlob((blob) => {
                                if (blob && !isResolved) {
                                    isResolved = true;
                                    clearTimeout(timeout);
                                    URL.revokeObjectURL(videoUrl);
                                    console.log('Thumbnail generated:', this.formatFileSize(blob.size));
                                    resolve(blob);
                                }
                            }, 'image/jpeg', 0.7);
                        };
                        
                    } catch (e) {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeout);
                            URL.revokeObjectURL(videoUrl);
                            reject(e);
                        }
                    }
                };
                
                video.onerror = (e) => {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeout);
                        URL.revokeObjectURL(videoUrl);
                        console.error('Video error for thumbnail:', e);
                        reject(new Error('Failed to load video for thumbnail'));
                    }
                };
                
                video.load();
                
            } catch (error) {
                console.error('Thumbnail error:', error);
                reject(error);
            }
        });
    },
    
    async uploadVideo() {
        const productId = document.getElementById('productSelect')?.value;
        const caption = document.getElementById('caption')?.value || '';
        const category = document.getElementById('videoCategory')?.value || 'product_demo';
        const thumbnailTime = parseInt(document.getElementById('thumbnailTime')?.value) || 1;
        
        if (!productId || !this.selectedFile) {
            this.showToast('Please select a product and video', 'error');
            return;
        }
        
        // Double-check file size before upload
        if (this.selectedFile.size > MAX_FILE_SIZE) {
            this.showToast(`File too large: ${this.formatFileSize(this.selectedFile.size)}. Maximum allowed is 5MB.`, 'error');
            return;
        }
        
        // Check trim duration
        const trimmedDuration = this.trimEnd - this.trimStart;
        if (trimmedDuration > MAX_DURATION) {
            this.showToast(`Video must be ${MAX_DURATION} seconds or less after trimming`, 'error');
            return;
        }
        
        try {
            this.showProgress(true);
            
            // Generate thumbnail
            this.updateProgress(20, 'Creating thumbnail...');
            const thumbnailBlob = await this.generateThumbnail(this.selectedFile, this.trimStart);
            
            // Upload original video (size already validated)
            this.updateProgress(50, 'Uploading video...');
            const videoUrl = await this.uploadToStorage(this.selectedFile, 'videos');
            
            // Upload thumbnail
            this.updateProgress(80, 'Uploading thumbnail...');
            const thumbnailUrl = await this.uploadToStorage(thumbnailBlob, 'thumbnails');
            
            // Save metadata
            this.updateProgress(95, 'Saving to database...');
            
            const metadata = {
                supplier_id: this.supplier.id,
                product_id: productId,
                video_url: videoUrl,
                thumbnail_url: thumbnailUrl,
                caption: caption || null,
                category: category,
                duration: Math.round(trimmedDuration),
                file_size: parseInt(this.selectedFile.size),
                trim_start: parseFloat((this.trimStart).toFixed(1)),
                trim_end: parseFloat((this.trimEnd).toFixed(1)),
                views: 0,
                likes: 0,
                created_at: new Date().toISOString()
            };
            
            console.log('Saving metadata:', metadata);
            
            const { error } = await sb
                .from('product_videos')
                .insert([metadata]);
            
            if (error) {
                console.error('Database error:', error);
                throw new Error('Failed to save video metadata');
            }
            
            console.log('✅ Upload complete!');
            this.showToast('Upload complete!', 'success');
            
            setTimeout(() => {
                window.location.href = 'supplier-videos.html';
            }, 1500);
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Error: ' + error.message, 'error');
        } finally {
            this.showProgress(false);
        }
    },
    
    async uploadToStorage(file, folder) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = folder === 'videos' ? 'mp4' : 'jpg';
        const fileName = `${folder}_${timestamp}_${random}.${extension}`;
        const storagePath = `${this.supplier.id}/${folder}/${fileName}`;
        
        console.log(`Uploading to storage: ${storagePath}`);
        
        const { error } = await sb.storage
            .from('product-videos')
            .upload(storagePath, file, {
                cacheControl: '3600',
                contentType: file.type || (folder === 'videos' ? 'video/mp4' : 'image/jpeg'),
                upsert: false
            });
        
        if (error) {
            console.error('Storage error:', error);
            throw new Error(`Storage upload failed: ${error.message}`);
        }
        
        const { data: { publicUrl } } = sb.storage
            .from('product-videos')
            .getPublicUrl(storagePath);
        
        return publicUrl;
    },
    
    updateProgress(percent, message) {
        const fill = document.getElementById('progressFill');
        const msg = document.getElementById('progressMessage');
        const span = msg?.querySelector('span');
        
        if (fill) fill.style.width = percent + '%';
        if (msg && span) {
            msg.classList.add('show');
            span.textContent = message;
        }
    },
    
    showProgress(show) {
        const bar = document.getElementById('progressBar');
        const btn = document.getElementById('uploadBtn');
        
        if (bar && btn) {
            bar.style.display = show ? 'block' : 'none';
            btn.disabled = show;
            if (!show) {
                document.getElementById('progressMessage')?.classList.remove('show');
            }
        }
    },
    
    escapeHtml(text) {
        return text ? String(text).replace(/[&<>"]/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
        }) : '';
    },
    
    showToast(message, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};

// Initialize
window.VideoUploader = VideoUploader;
window.uploadVideo = () => VideoUploader.uploadVideo();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VideoUploader.init());
} else {
    VideoUploader.init();
}