# -*- coding: utf-8 -*-

# ✅ Import solo modelli verificati e compatibili
from . import raccolta_config
from . import raccolta_session  
from . import raccolta_counter
from . import res_users
from . import sale_order
from . import stock_picking

# ✅ CONDIZIONALE: Import DDT solo se modulo installato
try:
    from . import stock_delivery_note
except ImportError:
    # Modulo DDT non installato - skip import
    pass