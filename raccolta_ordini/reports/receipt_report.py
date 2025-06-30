# -*- coding: utf-8 -*-

from odoo import api, models, fields, _
from odoo.exceptions import UserError
import base64
import io
from datetime import timedelta
try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


class ReceiptReport(models.AbstractModel):
    """Report per ricevute termiche 48mm e 80mm"""
    _name = 'report.raccolta_ordini.receipt_thermal'
    _description = 'Ricevute Termiche Raccolta Ordini'

    @api.model
    def _get_report_values(self, docids, data=None):
        """Prepara dati per report ricevute"""
        orders = self.env['sale.order'].browse(docids)
        
        # Verifica che siano ordini raccolta
        for order in orders:
            if not order.raccolta_session_id:
                raise UserError(_('Ricevute termiche disponibili solo per ordini raccolta'))
        
        return {
            'doc_ids': docids,
            'doc_model': 'sale.order',
            'docs': orders,
            'data': data,
            'format_48mm': self._format_48mm,
            'format_80mm': self._format_80mm,
            'get_company_logo': self._get_company_logo,
            'format_currency': self._format_currency,
            'format_date': self._format_date,
            'get_qr_code': self._get_qr_code,
            'wrap_text': self._wrap_text,
        }

    def _format_48mm(self, text, width=32):
        """Formatta testo per larghezza 48mm (32 caratteri)"""
        if not text:
            return ''
        
        text = str(text)
        if len(text) <= width:
            return text
        
        # Tronca con ellipsis
        return text[:width-3] + '...'

    def _format_80mm(self, text, width=48):
        """Formatta testo per larghezza 80mm (48 caratteri)"""
        if not text:
            return ''
        
        text = str(text)
        if len(text) <= width:
            return text
        
        # Tronca con ellipsis
        return text[:width-3] + '...'

    def _wrap_text(self, text, width):
        """Wrappa testo su più righe"""
        if not text:
            return []
        
        words = str(text).split()
        lines = []
        current_line = ''
        
        for word in words:
            if len(current_line + ' ' + word) <= width:
                if current_line:
                    current_line += ' ' + word
                else:
                    current_line = word
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        
        if current_line:
            lines.append(current_line)
        
        return lines

    def _get_company_logo(self, company):
        """Ottiene logo azienda per ricevuta"""
        if company.logo:
            return company.logo
        return False

    def _format_currency(self, amount, currency):
        """Formatta importo con valuta"""
        return f"{amount:.2f} {currency.symbol or currency.name}"

    def _format_date(self, date_field):
        """Formatta data per ricevuta"""
        if date_field:
            return date_field.strftime('%d/%m/%Y %H:%M')
        return ''

    def _get_qr_code(self, order):
        """Genera QR code per ordine"""
        try:
            import qrcode
            
            # Dati per QR code
            qr_data = f"ORDINE:{order.name}|CLIENTE:{order.partner_id.name}|TOTALE:{order.amount_total}|DATA:{order.date_order.strftime('%d/%m/%Y')}"
            
            # Genera QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=3,
                border=1,
            )
            qr.add_data(qr_data)
            qr.make(fit=True)
            
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Converti in base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            qr_code_b64 = base64.b64encode(buffer.getvalue()).decode()
            
            return qr_code_b64
            
        except ImportError:
            return False
        except Exception:
            return False

    @api.model
    def generate_receipt_48mm(self, order_id):
        """Genera ricevuta termica 48mm come testo formattato"""
        order = self.env['sale.order'].browse(order_id)
        if not order.exists():
            raise UserError(_('Ordine non trovato'))

        lines = []
        
        # Header azienda
        company = order.company_id
        lines.append('=' * 32)
        lines.append(self._format_48mm(company.name).center(32))
        if company.street:
            lines.append(self._format_48mm(company.street).center(32))
        if company.city:
            city_line = f"{company.zip or ''} {company.city or ''}".strip()
            lines.append(self._format_48mm(city_line).center(32))
        if company.vat:
            lines.append(f"P.IVA: {company.vat}".center(32))
        lines.append('=' * 32)
        
        # Info ordine
        lines.append('')
        lines.append(f"ORDINE: {order.name}")
        lines.append(f"DATA: {self._format_date(order.date_order)}")
        if order.agent_code:
            lines.append(f"AGENTE: {order.agent_code}")
        lines.append('-' * 32)
        
        # Cliente
        lines.append(f"CLIENTE: {self._format_48mm(order.partner_id.name, 24)}")
        if order.partner_id.street:
            lines.append(f"  {self._format_48mm(order.partner_id.street, 30)}")
        if order.partner_id.city:
            city = f"{order.partner_id.zip or ''} {order.partner_id.city or ''}".strip()
            lines.append(f"  {self._format_48mm(city, 30)}")
        lines.append('-' * 32)
        
        # Prodotti
        lines.append("PRODOTTI:")
        for line in order.order_line:
            product_name = self._format_48mm(line.product_id.name, 20)
            qty = f"{line.product_uom_qty:.0f}"
            price = f"{line.price_unit:.2f}"
            subtotal = f"{line.price_subtotal:.2f}"
            
            lines.append(f"{product_name}")
            lines.append(f"  {qty} x {price} = {subtotal}")
        
        lines.append('-' * 32)
        
        # Totali
        lines.append(f"SUBTOTALE:       {order.amount_untaxed:>10.2f}")
        lines.append(f"IVA:             {order.amount_tax:>10.2f}")
        lines.append('=' * 32)
        lines.append(f"TOTALE:          {order.amount_total:>10.2f}")
        lines.append('=' * 32)
        
        # Note
        if order.general_notes:
            lines.append('')
            lines.append("NOTE:")
            note_lines = self._wrap_text(order.general_notes, 32)
            lines.extend(note_lines)
        
        # Footer
        lines.append('')
        lines.append("Grazie per aver scelto")
        lines.append(self._format_48mm(company.name).center(32))
        lines.append('')
        lines.append(f"Stampato: {fields.Datetime.now().strftime('%d/%m/%Y %H:%M')}")
        lines.append('')
        
        return '\n'.join(lines)

    @api.model
    def generate_receipt_80mm(self, order_id):
        """Genera ricevuta termica 80mm come testo formattato"""
        order = self.env['sale.order'].browse(order_id)
        if not order.exists():
            raise UserError(_('Ordine non trovato'))

        lines = []
        
        # Header azienda
        company = order.company_id
        lines.append('=' * 48)
        lines.append(self._format_80mm(company.name).center(48))
        if company.street:
            lines.append(self._format_80mm(company.street).center(48))
        if company.city:
            city_line = f"{company.zip or ''} {company.city or ''}".strip()
            lines.append(self._format_80mm(city_line).center(48))
        if company.vat:
            lines.append(f"P.IVA: {company.vat}".center(48))
        if company.phone:
            lines.append(f"Tel: {company.phone}".center(48))
        lines.append('=' * 48)
        
        # Info ordine
        lines.append('')
        lines.append(f"ORDINE: {order.name}")
        lines.append(f"DATA: {self._format_date(order.date_order)}")
        if order.agent_code:
            lines.append(f"AGENTE: {order.agent_code}")
        lines.append('-' * 48)
        
        # Cliente
        lines.append(f"CLIENTE: {self._format_80mm(order.partner_id.name, 40)}")
        if order.partner_id.street:
            lines.append(f"  {self._format_80mm(order.partner_id.street, 46)}")
        if order.partner_id.city:
            city = f"{order.partner_id.zip or ''} {order.partner_id.city or ''}".strip()
            lines.append(f"  {self._format_80mm(city, 46)}")
        if order.partner_id.vat:
            lines.append(f"  P.IVA: {order.partner_id.vat}")
        lines.append('-' * 48)
        
        # Header prodotti
        lines.append("PRODOTTI:")
        lines.append(f"{'Descrizione':<25} {'Q.ta':>5} {'Prezzo':>8} {'Totale':>8}")
        lines.append('-' * 48)
        
        # Prodotti
        for line in order.order_line:
            product_name = self._format_80mm(line.product_id.name, 25)
            qty = f"{line.product_uom_qty:.0f}"
            price = f"{line.price_unit:.2f}"
            subtotal = f"{line.price_subtotal:.2f}"
            
            lines.append(f"{product_name:<25} {qty:>5} {price:>8} {subtotal:>8}")
            
            # Note prodotto se presenti
            if hasattr(line, 'note') and line.note:
                note_lines = self._wrap_text(f"  Nota: {line.note}", 46)
                lines.extend(note_lines)
        
        lines.append('-' * 48)
        
        # Totali
        lines.append(f"SUBTOTALE: {order.amount_untaxed:>33.2f}")
        lines.append(f"IVA:       {order.amount_tax:>33.2f}")
        lines.append('=' * 48)
        lines.append(f"TOTALE:    {order.amount_total:>33.2f} {order.currency_id.name}")
        lines.append('=' * 48)
        
        # DDT collegati
        if order.ddt_ids:
            lines.append('')
            lines.append("DDT COLLEGATI:")
            for ddt in order.ddt_ids:
                lines.append(f"  {ddt.name} - {ddt.date.strftime('%d/%m/%Y')}")
        
        # Note
        if order.general_notes:
            lines.append('')
            lines.append("NOTE:")
            note_lines = self._wrap_text(order.general_notes, 48)
            lines.extend(note_lines)
        
        # Footer
        lines.append('')
        lines.append("Grazie per aver scelto".center(48))
        lines.append(self._format_80mm(company.name).center(48))
        if company.website:
            lines.append(self._format_80mm(company.website).center(48))
        lines.append('')
        lines.append(f"Stampato: {fields.Datetime.now().strftime('%d/%m/%Y %H:%M')}".center(48))
        lines.append('')
        
        return '\n'.join(lines)