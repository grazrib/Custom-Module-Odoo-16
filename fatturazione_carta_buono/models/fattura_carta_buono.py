# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import UserError
import base64
from lxml import etree
import random
import string
import re
from datetime import datetime


class FatturazioneCartaBuono(models.Model):
    _name = 'fatturazione.carta.buono'
    _description = 'Fattura Elettronica per Carta Docente e CarteCultura'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    # Campi base
    name = fields.Char(string='Nome', compute='_compute_name', store=True)
    company_id = fields.Many2one('res.company', string='Azienda', required=True, default=lambda self: self.env.company)
    partner_id = fields.Many2one('res.partner', string='Ministero', required=True, domain=[('is_ministry', '=', True)])
    
    # Campi fattura
    tipologia = fields.Selection([
        ('CARTECULTURA', 'CarteCultura (18App)'),
        ('CARTA DOCENTE', 'Carta Docente')
    ], string='Tipologia Buono', required=True, default='CARTECULTURA')
    
    codice_buono = fields.Char(string='Codice Buono', required=True)
    importo = fields.Float(string='Importo', required=True, digits=(16, 2))
    numero_fattura = fields.Char(string='Numero Fattura', required=True)
    data_fattura = fields.Date(string='Data Fattura', required=True, default=fields.Date.today)
    
    # Campo per il file generato
    fattura_file = fields.Binary(string='File Fattura XML', readonly=True)
    fattura_filename = fields.Char(string='Nome File XML', readonly=True)
    
    # Campi computed per dati ministero
    cod_fiscale_ministero = fields.Char(string='Codice Fiscale Ministero', compute='_compute_dati_ministero')
    denominazione_ministero = fields.Char(string='Denominazione Ministero', compute='_compute_dati_ministero')
    indirizzo_ministero = fields.Char(string='Indirizzo Ministero', compute='_compute_dati_ministero')
    numero_civico_ministero = fields.Char(string='Numero Civico Ministero', compute='_compute_dati_ministero')
    cap_ministero = fields.Char(string='CAP Ministero', compute='_compute_dati_ministero')
    comune_ministero = fields.Char(string='Comune Ministero', compute='_compute_dati_ministero')
    provincia_ministero = fields.Char(string='Provincia Ministero', compute='_compute_dati_ministero')
    nazione_ministero = fields.Char(string='Nazione Ministero', compute='_compute_dati_ministero')
    codice_destinatario = fields.Char(string='Codice Destinatario', compute='_compute_dati_ministero')
    
    @api.depends('tipologia', 'partner_id')
    def _compute_dati_ministero(self):
        for record in self:
            # Verifica se il campo l10n_it_codice_destinatario esiste nel modello
            has_codice_dest = 'l10n_it_codice_destinatario' in self.env['res.partner']._fields
            
            if record.tipologia == 'CARTECULTURA':
                default_values = {
                    'cod_fiscale_ministero': '80188210589',
                    'denominazione_ministero': 'Ministero della Cultura - 18App',
                    'indirizzo_ministero': 'Via del Collegio Romano, 27',
                    'numero_civico_ministero': '',
                    'cap_ministero': '00186',
                    'comune_ministero': 'Roma',
                    'provincia_ministero': 'RM',
                    'nazione_ministero': 'IT',
                    'codice_destinatario': 'YD2JNF'
                }
            else:  # CARTA DOCENTE
                default_values = {
                    'cod_fiscale_ministero': '80185250588',
                    'denominazione_ministero': 'Ministero dell\'istruzione',
                    'indirizzo_ministero': 'Viale Trastevere',
                    'numero_civico_ministero': '76/A',
                    'cap_ministero': '00153',
                    'comune_ministero': 'Roma',
                    'provincia_ministero': 'RM',
                    'nazione_ministero': 'IT',
                    'codice_destinatario': 'QGGT71'
                }
            
            # Usa i valori dal partner se disponibili, altrimenti usa i default
            if record.partner_id:
                record.cod_fiscale_ministero = record.partner_id.vat or default_values['cod_fiscale_ministero']
                record.denominazione_ministero = record.partner_id.name or default_values['denominazione_ministero']
                record.indirizzo_ministero = record.partner_id.street or default_values['indirizzo_ministero']
                record.numero_civico_ministero = record.partner_id.street2 or default_values['numero_civico_ministero']
                record.cap_ministero = record.partner_id.zip or default_values['cap_ministero']
                record.comune_ministero = record.partner_id.city or default_values['comune_ministero']
                record.provincia_ministero = record.partner_id.state_id.code or default_values['provincia_ministero']
                record.nazione_ministero = record.partner_id.country_id.code or default_values['nazione_ministero']
                
                # Controlla se il campo esiste prima di usarlo
                if has_codice_dest and hasattr(record.partner_id, 'l10n_it_codice_destinatario'):
                    record.codice_destinatario = record.partner_id.l10n_it_codice_destinatario or default_values['codice_destinatario']
                else:
                    record.codice_destinatario = default_values['codice_destinatario']
            else:
                record.cod_fiscale_ministero = default_values['cod_fiscale_ministero']
                record.denominazione_ministero = default_values['denominazione_ministero']
                record.indirizzo_ministero = default_values['indirizzo_ministero']
                record.numero_civico_ministero = default_values['numero_civico_ministero']
                record.cap_ministero = default_values['cap_ministero']
                record.comune_ministero = default_values['comune_ministero']
                record.provincia_ministero = default_values['provincia_ministero']
                record.nazione_ministero = default_values['nazione_ministero']
                record.codice_destinatario = default_values['codice_destinatario']
    
    @api.depends('tipologia', 'numero_fattura', 'data_fattura')
    def _compute_name(self):
        for record in self:
            tipo_abbr = 'CC' if record.tipologia == 'CARTECULTURA' else 'CD'
            data_str = ''
            if record.data_fattura:
                data_str = record.data_fattura.strftime('%d/%m/%Y')
            record.name = f"Fattura {tipo_abbr} {record.numero_fattura or ''} - {data_str}"
    
    def _genera_id_casuale(self, length=4):
        """Genera un ID alfanumerico casuale"""
        return ''.join(random.choice(string.ascii_letters + string.digits) for _ in range(length))
    
    def _formatta_numero_fattura(self, numero):
        """Formatta il numero fattura a 4 cifre"""
        return str(numero).zfill(4)
    
    @api.model
    def _get_default_partner_cartecultura(self):
        """Trova o crea un partner per CarteCultura"""
        partner = self.env['res.partner'].search([
            ('name', '=', 'Ministero della Cultura - 18App'),
            ('is_ministry', '=', True)
        ], limit=1)
        
        if not partner:
            # Verifica se il campo l10n_it_codice_destinatario esiste nel modello
            has_codice_dest = 'l10n_it_codice_destinatario' in self.env['res.partner']._fields
            
            partner_vals = {
                'name': 'Ministero della Cultura - 18App',
                'vat': '80188210589',
                'street': 'Via del Collegio Romano, 27',
                'zip': '00186',
                'city': 'Roma',
                'state_id': self.env['res.country.state'].search([('code', '=', 'RM')], limit=1).id,
                'country_id': self.env['res.country'].search([('code', '=', 'IT')], limit=1).id,
                'is_ministry': True,
                'company_type': 'company'
            }
            
            # Aggiungi il codice destinatario solo se il campo esiste
            if has_codice_dest:
                partner_vals['l10n_it_codice_destinatario'] = 'YD2JNF'
                
            partner = self.env['res.partner'].create(partner_vals)
        
        return partner
    
    @api.model
    def _get_default_partner_carta_docente(self):
        """Trova o crea un partner per Carta Docente"""
        partner = self.env['res.partner'].search([
            ('name', '=', 'Ministero dell\'istruzione'),
            ('is_ministry', '=', True)
        ], limit=1)
        
        if not partner:
            # Verifica se il campo l10n_it_codice_destinatario esiste nel modello
            has_codice_dest = 'l10n_it_codice_destinatario' in self.env['res.partner']._fields
            
            partner_vals = {
                'name': 'Ministero dell\'istruzione',
                'vat': '80185250588',
                'street': 'Viale Trastevere, 76/A',  # Incluso il numero civico nell'indirizzo
                'zip': '00153',
                'city': 'Roma',
                'state_id': self.env['res.country.state'].search([('code', '=', 'RM')], limit=1).id,
                'country_id': self.env['res.country'].search([('code', '=', 'IT')], limit=1).id,
                'is_ministry': True,
                'company_type': 'company'
            }
            
            # Aggiungi il codice destinatario solo se il campo esiste
            if has_codice_dest:
                partner_vals['l10n_it_codice_destinatario'] = 'QGGT71'
                
            partner = self.env['res.partner'].create(partner_vals)
        
        return partner
    
    @api.onchange('tipologia')
    def _onchange_tipologia(self):
        """Cambia il partner in base alla tipologia selezionata"""
        if self.tipologia == 'CARTECULTURA':
            self.partner_id = self._get_default_partner_cartecultura()
        else:
            self.partner_id = self._get_default_partner_carta_docente()
    
    def action_genera_fattura(self):
        """Genera il file XML della fattura e lo allega al record"""
        for record in self:
            # Controlli preliminari
            if not record.company_id.vat:
                raise UserError(_("La partita IVA dell'azienda non è impostata"))
            
            # Estrai il codice fiscale/partita IVA senza prefisso paese
            vat_clean = re.sub(r'[^0-9]', '', record.company_id.vat)
            
            # Genera XML in base alla tipologia
            xml_content = self._genera_xml_fattura(record)
            
            # Genera nome file conforme
            id_casuale = self._genera_id_casuale()
            numero_formattato = self._formatta_numero_fattura(record.numero_fattura)
            nome_file = f"IT{vat_clean}_{numero_formattato}{id_casuale}.xml"
            
            # Allega il file al record
            record.write({
                'fattura_file': base64.b64encode(xml_content.encode('utf-8')),
                'fattura_filename': nome_file
            })
            
            return {
                'type': 'ir.actions.act_window',
                'res_model': 'fatturazione.carta.buono',
                'view_mode': 'form',
                'res_id': record.id,
                'target': 'current',
                'context': {'default_download': True}
            }
    
    def _genera_xml_fattura(self, record):
        """Genera il contenuto XML della fattura"""
        # Dati azienda
        company = record.company_id
        vat_clean = re.sub(r'[^0-9]', '', company.vat) if company.vat else ''
        country_code = company.country_id.code if company.country_id else 'IT'
        
        # Formattazione importo con due decimali
        importo_str = "{:.2f}".format(record.importo)
        
        # Formatta IBAN rimuovendo gli spazi
        iban = company.bank_ids and company.bank_ids[0].acc_number or ''
        iban_clean = iban.replace(' ', '')  # Rimuove tutti gli spazi dall'IBAN
        
        # Nome istituto bancario
        istituto_finanziario = company.bank_ids and company.bank_ids[0].bank_id.name or 'Banca'
        
        if record.tipologia == 'CARTECULTURA':
            xml_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" versione="FPA12">
    <FatturaElettronicaHeader>
        <DatiTrasmissione>
            <IdTrasmittente>
                <IdPaese>{country_code}</IdPaese>
                <IdCodice>{vat_clean}</IdCodice>
            </IdTrasmittente>
            <ProgressivoInvio>{self._genera_id_casuale(5)}</ProgressivoInvio>
            <FormatoTrasmissione>FPA12</FormatoTrasmissione>
            <CodiceDestinatario>{record.codice_destinatario}</CodiceDestinatario>
        </DatiTrasmissione>
        <CedentePrestatore>
            <DatiAnagrafici>
                <IdFiscaleIVA>
                    <IdPaese>{country_code}</IdPaese>
                    <IdCodice>{vat_clean}</IdCodice>
                </IdFiscaleIVA>
                <CodiceFiscale>{vat_clean}</CodiceFiscale>
                <Anagrafica>
                    <Denominazione>{company.name}</Denominazione>
                </Anagrafica>
                <RegimeFiscale>{company.l10n_it_tax_system if hasattr(company, 'l10n_it_tax_system') else 'RF01'}</RegimeFiscale>
            </DatiAnagrafici>
            <Sede>
                <Indirizzo>{company.street or ''}</Indirizzo>
                <CAP>{company.zip or ''}</CAP>
                <Comune>{company.city or ''}</Comune>
                <Provincia>{company.state_id.code if company.state_id else ''}</Provincia>
                <Nazione>{country_code}</Nazione>
            </Sede>
        </CedentePrestatore>
        <CessionarioCommittente>
            <DatiAnagrafici>
                <CodiceFiscale>{record.cod_fiscale_ministero}</CodiceFiscale>
                <Anagrafica>
                    <Denominazione>{record.denominazione_ministero}</Denominazione>
                </Anagrafica>
            </DatiAnagrafici>
            <Sede>
                <Indirizzo>{record.indirizzo_ministero}</Indirizzo>
                <CAP>{record.cap_ministero}</CAP>
                <Comune>{record.comune_ministero}</Comune>
                <Provincia>{record.provincia_ministero}</Provincia>
                <Nazione>{record.nazione_ministero}</Nazione>
            </Sede>
        </CessionarioCommittente>
        <SoggettoEmittente>TZ</SoggettoEmittente>
    </FatturaElettronicaHeader>
    <FatturaElettronicaBody>
        <DatiGenerali>
            <DatiGeneraliDocumento>
                <TipoDocumento>TD01</TipoDocumento>
                <Divisa>EUR</Divisa>
                <Data>{record.data_fattura.strftime('%Y-%m-%d')}</Data>
                <Numero>{record.numero_fattura}/C</Numero>
                <ImportoTotaleDocumento>{importo_str}</ImportoTotaleDocumento>
                <Causale>vendita</Causale>
            </DatiGeneraliDocumento>
        </DatiGenerali>
        <DatiBeniServizi>
            <DettaglioLinee>
                <NumeroLinea>1</NumeroLinea>
                <CodiceArticolo>
                    <CodiceTipo>CARTECULTURA</CodiceTipo>
                    <CodiceValore>{record.codice_buono}</CodiceValore>
                </CodiceArticolo>
                <Descrizione>Pagamento buono {record.codice_buono}</Descrizione>
                <Quantita>1.00</Quantita>
                <PrezzoUnitario>{importo_str}</PrezzoUnitario>
                <PrezzoTotale>{importo_str}</PrezzoTotale>
                <AliquotaIVA>0.00</AliquotaIVA>
                <Natura>N2.2</Natura>
            </DettaglioLinee>
            <DatiRiepilogo>
                <AliquotaIVA>0.00</AliquotaIVA>
                <Natura>N2.2</Natura>
                <ImponibileImporto>{importo_str}</ImponibileImporto>
                <Imposta>0.00</Imposta>
                <RiferimentoNormativo>ART. 2 DPR 633/72</RiferimentoNormativo>
            </DatiRiepilogo>
        </DatiBeniServizi>
        <DatiPagamento>
            <CondizioniPagamento>TP02</CondizioniPagamento>
            <DettaglioPagamento>
                <ModalitaPagamento>MP05</ModalitaPagamento>
                <ImportoPagamento>{importo_str}</ImportoPagamento>
                <IstitutoFinanziario>{istituto_finanziario}</IstitutoFinanziario>
                <IBAN>{iban_clean}</IBAN>
            </DettaglioPagamento>
        </DatiPagamento>
    </FatturaElettronicaBody>
</p:FatturaElettronica>'''
        else:
            # CARTA DOCENTE
            xml_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" versione="FPA12">
    <FatturaElettronicaHeader>
        <DatiTrasmissione>
            <IdTrasmittente>
                <IdPaese>{country_code}</IdPaese>
                <IdCodice>{vat_clean}</IdCodice>
            </IdTrasmittente>
            <ProgressivoInvio>{self._genera_id_casuale(5)}</ProgressivoInvio>
            <FormatoTrasmissione>FPA12</FormatoTrasmissione>
            <CodiceDestinatario>{record.codice_destinatario}</CodiceDestinatario>
        </DatiTrasmissione>
        <CedentePrestatore>
            <DatiAnagrafici>
                <IdFiscaleIVA>
                    <IdPaese>{country_code}</IdPaese>
                    <IdCodice>{vat_clean}</IdCodice>
                </IdFiscaleIVA>
                <CodiceFiscale>{vat_clean}</CodiceFiscale>
                <Anagrafica>
                    <Denominazione>{company.name}</Denominazione>
                </Anagrafica>
                <RegimeFiscale>{company.l10n_it_tax_system if hasattr(company, 'l10n_it_tax_system') else 'RF01'}</RegimeFiscale>
            </DatiAnagrafici>
            <Sede>
                <Indirizzo>{company.street or ''}</Indirizzo>
                <CAP>{company.zip or ''}</CAP>
                <Comune>{company.city or ''}</Comune>
                <Provincia>{company.state_id.code if company.state_id else ''}</Provincia>
                <Nazione>{country_code}</Nazione>
            </Sede>
        </CedentePrestatore>
        <CessionarioCommittente>
            <DatiAnagrafici>
                <CodiceFiscale>{record.cod_fiscale_ministero}</CodiceFiscale>
                <Anagrafica>
                    <Denominazione>{record.denominazione_ministero}</Denominazione>
                </Anagrafica>
            </DatiAnagrafici>
            <Sede>
                <Indirizzo>{record.indirizzo_ministero}</Indirizzo>
                <CAP>{record.cap_ministero}</CAP>
                <Comune>{record.comune_ministero}</Comune>
                <Provincia>{record.provincia_ministero}</Provincia>
                <Nazione>{record.nazione_ministero}</Nazione>
            </Sede>
        </CessionarioCommittente>
        <SoggettoEmittente>TZ</SoggettoEmittente>
    </FatturaElettronicaHeader>
    <FatturaElettronicaBody>
        <DatiGenerali>
            <DatiGeneraliDocumento>
                <TipoDocumento>TD01</TipoDocumento>
                <Divisa>EUR</Divisa>
                <Data>{record.data_fattura.strftime('%Y-%m-%d')}</Data>
                <Numero>{record.numero_fattura}/D</Numero>
                <ImportoTotaleDocumento>{importo_str}</ImportoTotaleDocumento>
                <Causale>vendita</Causale>
            </DatiGeneraliDocumento>
        </DatiGenerali>
        <DatiBeniServizi>
            <DettaglioLinee>
                <NumeroLinea>1</NumeroLinea>
                <CodiceArticolo>
                    <CodiceTipo>CARTA DOCENTE</CodiceTipo>
                    <CodiceValore>{record.codice_buono}</CodiceValore>
                </CodiceArticolo>
                <Descrizione>Pagamento buono carta docente {record.codice_buono}</Descrizione>
                <Quantita>1.00</Quantita>
                <PrezzoUnitario>{importo_str}</PrezzoUnitario>
                <PrezzoTotale>{importo_str}</PrezzoTotale>
                <AliquotaIVA>0.00</AliquotaIVA>
                <Natura>N2.2</Natura>
            </DettaglioLinee>
            <DatiRiepilogo>
                <AliquotaIVA>0.00</AliquotaIVA>
                <Natura>N2.2</Natura>
                <ImponibileImporto>{importo_str}</ImponibileImporto>
                <Imposta>0.00</Imposta>
                <RiferimentoNormativo>FUORI CAMPO IVA CONTRIBUENTI MINIMI</RiferimentoNormativo>
            </DatiRiepilogo>
        </DatiBeniServizi>
        <DatiPagamento>
            <CondizioniPagamento>TP02</CondizioniPagamento>
            <DettaglioPagamento>
                <ModalitaPagamento>MP05</ModalitaPagamento>
                <ImportoPagamento>{importo_str}</ImportoPagamento>
                <IstitutoFinanziario>{istituto_finanziario}</IstitutoFinanziario>
                <IBAN>{iban_clean}</IBAN>
            </DettaglioPagamento>
        </DatiPagamento>
    </FatturaElettronicaBody>
</p:FatturaElettronica>'''
        
        return xml_content
    
    def action_download_xml(self):
        """Azione per il download del file XML"""
        self.ensure_one()
        
        if not self.fattura_file:
            raise UserError(_("Nessun file XML generato. Genera prima la fattura."))
        
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/?model=fatturazione.carta.buono&id={self.id}&field=fattura_file&filename={self.fattura_filename}&download=true',
            'target': 'self',
        }


class ResPartner(models.Model):
    _inherit = 'res.partner'
    
    is_ministry = fields.Boolean(string='È un Ministero', default=False, 
                                help='Indica se il partner è un ministero per Carta Docente o CarteCultura')