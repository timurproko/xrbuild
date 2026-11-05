export interface ExternalToolLink {id:string;label:string;url:string;passPanelOrigin?:boolean}
export interface ManagedToolLink {id:string;label:string;route:string}
export type ToolLink=ExternalToolLink|ManagedToolLink;
export interface NavigationItem {id?:string;label?:string;href?:string;separator?:boolean;current:boolean}
export function panelOrigin(value:unknown):string|null;
export function panelDestination(origin:string,page:'projects'|'plugins'|'rebuild'|'restart'):string;
export function toolDestination(url:string,origin:string,passPanelOrigin?:boolean):string;
export function managedToolDestination(route:string,origin:string):string;
export function shouldReportNavigationError(error:unknown,panelFreshness:{outdated?:boolean}|null|undefined):boolean;
export function requestedNavigation(url:string):{page:'projects'|'plugins'|null;maintenance:'rebuild'|'restart'|null;job:number|null;cleanUrl:string};
export function navigationItems(origin:string,tools?:readonly ToolLink[],current?:string):NavigationItem[];
export function renderNavigationMenu(menu:HTMLElement,options:{origin:string;tools?:readonly ToolLink[];current?:string;indicators?:boolean}):void;
export function isReplacementPanel(previous:{pid?:number;instanceId?:string}|null|undefined,ping:{app?:string;pid?:number;instanceId?:string}|null|undefined):boolean;
export function replaceActiveDocument(target?:{href:string;replace(url:string):void}):void;
export function restartPanelInPlace(origin?:string):Promise<void>;
export function rebuildHostInPlace(origin?:string):Promise<void>;
export function menuKeyboard(event:KeyboardEvent,menu:HTMLElement,close:()=>void):void;
export function mountToolNavigation(button:HTMLElement,menu:HTMLElement,options:{origin:string;tools:readonly ToolLink[];current:string}):()=>void;
