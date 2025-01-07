class GalliunClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:5173';
    this.popupOrigin = new URL(this.baseUrl).origin;
    
    // Bind event handlers
    this.handleMessage = this.handleMessage.bind(this);
    window.addEventListener('message', this.handleMessage);

    // Store active features that need message handling
    this._activeFeatures = new Set();
  }

  // Core payment functionality
  async createPayment(productId) {
    // Future implementation: Create a payment intent/session
    return { productId };
  }

  async getProduct(productId) {
    // Future implementation: Get product details
    return { id: productId };
  }

  // UI Elements
  elements = {
    // Create a payment button
    createButton: (elementId, options = {}) => {
      const button = new GalliunButton(elementId, {
        ...options,
        baseUrl: this.baseUrl,
        registerFeature: this.registerFeature.bind(this),
        unregisterFeature: this.unregisterFeature.bind(this)
      });
      return button;
    }
  };

  // Feature registration system
  registerFeature(feature) {
    this._activeFeatures.add(feature);
  }

  unregisterFeature(feature) {
    this._activeFeatures.delete(feature);
  }

  handleMessage(event) {
    if (event.origin !== this.popupOrigin) return;

    // Dispatch message to all active features
    this._activeFeatures.forEach(feature => {
      if (typeof feature.handleMessage === 'function') {
        feature.handleMessage(event);
      }
    });
  }

  destroy() {
    window.removeEventListener('message', this.handleMessage);
    this._activeFeatures.forEach(feature => {
      if (typeof feature.destroy === 'function') {
        feature.destroy();
      }
    });
    this._activeFeatures.clear();
  }
}

class GalliunButton {
  constructor(elementId, config) {
    this.elementId = elementId;
    this.baseUrl = config.baseUrl;
    this.registerFeature = config.registerFeature;
    this.unregisterFeature = config.unregisterFeature;
    this.popup = null;
    this.callbacks = {};
  }

  mount(options = {}) {
    const container = document.getElementById(this.elementId);
    if (!container) {
      console.error(`Element with id "${this.elementId}" not found`);
      return;
    }

    // Store callbacks
    this.callbacks = {
      onSuccess: options.onSuccess,
      onError: options.onError,
      onClose: options.onClose,
      onLoaded: options.onLoaded
    };

    // Register this button as a feature
    this.registerFeature(this);

    // Validate required options
    if (!options.productId) {
      this.handleError({
        type: 'validation_error',
        code: 'parameter_missing',
        message: 'Product ID is required',
        param: 'productId'
      });
      return;
    }

    // Store productId for error handling
    this.productId = options.productId;

    // Create button with default or custom styles
    const button = document.createElement('button');
    button.textContent = options.buttonText || 'Pay with Galliun';
    
    // Apply base styles
    Object.assign(button.style, {
      padding: options.buttonSize === 'large' ? '16px 24px' : options.buttonSize === 'small' ? '8px 16px' : '12px 20px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: options.buttonSize === 'large' ? '16px' : options.buttonSize === 'small' ? '14px' : '15px',
      fontWeight: '500',
      transition: 'all 0.2s ease',
      width: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px'
    });

    // Apply theme styles
    if (options.buttonTheme === 'dark') {
      Object.assign(button.style, {
        background: '#1e293b',
        color: '#ffffff'
      });
    } else {
      Object.assign(button.style, {
        background: '#4f46e5',
        color: '#ffffff'
      });
    }

    // Apply custom styles if provided
    if (options.customStyles) {
      Object.assign(button.style, options.customStyles);
    }

    // Add hover effect
    button.addEventListener('mouseover', () => {
      button.style.transform = 'translateY(-1px)';
      button.style.opacity = '0.9';
    });

    button.addEventListener('mouseout', () => {
      button.style.transform = 'translateY(0)';
      button.style.opacity = '1';
    });

    // Add click handler
    button.addEventListener('click', () => this.openPopup(options.productId));

    // Clear container and append button
    container.innerHTML = '';
    container.appendChild(button);
  }

  handleMessage(event) {
    const { type, data } = event.data;

    switch (type) {
      case 'GALLIUN_LOADED':
        this.callbacks.onLoaded?.();
        break;

      case 'GALLIUN_SUCCESS':
        if (this.callbacks.onSuccess) {
          const result = {
            id: data.transactionId,
            status: 'succeeded',
            amount: data.amount,
            currency: data.coinType,
            created: data.timestamp,
            metadata: {
              productId: data.productId,
              billId: data.billId
            },
            product: data.product
          };
          this.callbacks.onSuccess(result);
        }
        if (this.popup) {
          this.popup.close();
        }
        break;

      case 'GALLIUN_ERROR':
        this.handleError(data);
        break;

      case 'GALLIUN_CLOSE':
        if (this.popup) {
          this.popup.close();
        }
        this.callbacks.onClose?.();
        break;
    }
  }

  handleError(error) {
    if (this.callbacks.onError) {
      const standardError = {
        type: error.type || 'api_error',
        code: error.code,
        message: error.message || error.error,
        param: error.param,
        metadata: {
          productId: this.productId,
          timestamp: Date.now()
        }
      };
      this.callbacks.onError(standardError);
    }
    if (this.popup) {
      this.popup.close();
    }
  }

  openPopup(productId) {
    // Close existing popup if any
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }

    const width = 400;
    const height = 600;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;

    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes'
    ].join(',');

    this.popup = window.open(
      `${this.baseUrl}/popup-payment?productId=${encodeURIComponent(productId)}`,
      'GalliunPaymentPopup',
      features
    );

    // Check if popup was blocked
    if (!this.popup || this.popup.closed) {
      this.handleError({
        type: 'popup_error',
        code: 'popup_blocked',
        message: 'Payment popup was blocked. Please allow popups for this site.'
      });
      return;
    }

    // Poll for popup closure
    const pollTimer = setInterval(() => {
      if (!this.popup || this.popup.closed) {
        clearInterval(pollTimer);
        this.callbacks.onClose?.();
      }
    }, 500);
  }

  destroy() {
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    this.unregisterFeature(this);
  }
}

// Make it available globally
window.Galliun = {
  createClient: (config) => new GalliunClient(config)
}; 