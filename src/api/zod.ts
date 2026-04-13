import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

type LocationTreeNodeDto = Partial<{
  id: number;
  name: string;
  type: LocationType;
  children: Array<LocationTreeNodeDto>;
}>;
type LocationType = "region" | "city" | "district";

const AdStatus = z.enum(["active", "pendingModeration", "rejected", "deleted"]);
const AdminAdOwnerDto = z
  .object({
    id: z.number().int(),
    userLogin: z.string(),
    userName: z.string().nullable(),
    avatarPath: z.string().nullable(),
  })
  .partial();
const AdCategoryDto = z
  .object({
    id: z.number().int(),
    name: z.string(),
    parentId: z.number().int().nullable(),
  })
  .partial();
const LocationType = z.enum(["region", "city", "district"]);
const LocationRef = z
  .object({
    type: LocationType,
    id: z.number().int(),
    name: z.string().nullable(),
  })
  .partial();
const AdminAdListItemDto = z
  .object({
    id: z.number().int(),
    userId: z.number().int(),
    categoryId: z.number().int().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    listingType: z.string().nullable(),
    isNegotiable: z.boolean(),
    locationId: z.number().int(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    moderationStatus: AdStatus,
    rejectionReason: z.string().nullable(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    viewsCount: z.number().int(),
    favoritesCount: z.number().int(),
    owner: AdminAdOwnerDto,
    category: AdCategoryDto,
    location: LocationRef,
    mainImagePath: z.string().nullable(),
  })
  .partial();
const AdminAdListItemDtoPagedResultDto = z
  .object({
    items: z.array(AdminAdListItemDto),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .partial();
const PatchIssueDto = z
  .object({
    code: z.string(),
    field: z.string().nullable(),
    message: z.string(),
  })
  .partial();
const ApiError = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().nullable(),
    issues: z.array(PatchIssueDto).nullable(),
  })
  .partial();
const UserDto = z
  .object({
    id: z.number().int(),
    userLogin: z.string(),
    userName: z.string().nullable(),
    userEmail: z.string().nullable(),
    userPhoneNumber: z.string().nullable(),
    avatarPath: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    lastActivityAt: z.string().datetime({ offset: true }),
    roles: z.array(z.string()),
  })
  .partial();
const UserDtoPagedResultDto = z
  .object({
    items: z.array(UserDto),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .partial();
const AdminAuditLogDto = z
  .object({
    id: z.number().int(),
    actorUserId: z.number().int(),
    targetUserId: z.number().int().nullable(),
    action: z.string(),
    targetType: z.string().nullable(),
    targetId: z.number().int().nullable(),
    reason: z.string().nullable(),
    oldValue: z.string().nullable(),
    newValue: z.string().nullable(),
    timestamp: z.string().datetime({ offset: true }),
  })
  .partial();
const AdminAuditLogDtoPagedResultDto = z
  .object({
    items: z.array(AdminAuditLogDto),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .partial();
const RestrictionTypeDto = z
  .object({ key: z.string(), label: z.string() })
  .partial();
const RestrictionActionDto = z
  .object({
    id: z.number().int(),
    restriction: z.string(),
    reason: z.string().nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    revokeSessions: z.boolean(),
  })
  .partial();
const RoleDto = z.object({ role: z.string() }).partial();
const RoleActionDto = z
  .object({ id: z.number().int(), role: z.string() })
  .partial();
const AdStatusActionDto = z
  .object({ id: z.number().int(), status: AdStatus })
  .partial();
const UpdateModerationRequest = z.object({
  status: AdStatus,
  reason: z.string().max(500).nullish(),
});
const AdDto = z
  .object({
    id: z.number().int(),
    userId: z.number().int(),
    categoryId: z.number().int().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    listingType: z.string().nullable(),
    isNegotiable: z.boolean(),
    locationId: z.number().int(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    status: AdStatus,
    rejectionReason: z.string().nullable(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    viewsCount: z.number().int(),
    favoritesCount: z.number().int(),
  })
  .partial();
const ModerationAdDto = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    categoryId: z.number().int().nullable(),
    locationId: z.number().int(),
    location: LocationRef,
    listingType: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    userId: z.number().int(),
    userName: z.string().nullable(),
    userLogin: z.string().nullable(),
    mainImagePath: z.string().nullable(),
  })
  .partial();
const AdListItemDto = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    isNegotiable: z.boolean(),
    categoryId: z.number().int().nullable(),
    locationId: z.number().int(),
    location: LocationRef,
    listingType: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    userId: z.number().int(),
    viewsCount: z.number().int(),
    favoritesCount: z.number().int(),
    mainImagePath: z.string().nullable(),
    isFavorite: z.boolean(),
    moderationStatus: AdStatus,
  })
  .partial();
const AdListItemDtoPagedResultDto = z
  .object({
    items: z.array(AdListItemDto),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .partial();
const postAds_Body = z
  .object({
    Title: z.string(),
    Description: z.string().optional(),
    Price: z.number().optional(),
    IsNegotiable: z.boolean().optional(),
    CategoryId: z.number().int(),
    ListingType: z.string().optional(),
    LocationId: z.number().int(),
    Files: z.array(z.instanceof(File)).optional(),
    files: z.array(z.instanceof(File)).optional(),
    mainImageIndex: z.number().int().optional(),
  })
  .passthrough();
const AdImageDto = z
  .object({
    id: z.number().int(),
    adId: z.number().int(),
    filePath: z.string(),
    sortOrder: z.number().int(),
    isMain: z.boolean(),
  })
  .partial();
const CreateAdResultDto = z
  .object({
    message: z.string(),
    adId: z.number().int(),
    images: z.array(AdImageDto).nullable(),
  })
  .partial();
const AdOwnerDto = z
  .object({
    id: z.number().int(),
    userLogin: z.string(),
    userName: z.string().nullable(),
    userEmail: z.string().nullable(),
    userPhoneNumber: z.string().nullable(),
    avatarPath: z.string().nullable(),
    roles: z.array(z.string()),
    createdAt: z.string().datetime({ offset: true }),
    lastActivityAt: z.string().datetime({ offset: true }),
  })
  .partial();
const AdDetailsDto = z
  .object({
    id: z.number().int(),
    userId: z.number().int(),
    categoryId: z.number().int().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    isNegotiable: z.boolean(),
    locationId: z.number().int(),
    location: LocationRef,
    listingType: z.string().nullable(),
    mainImageId: z.number().int().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    moderationStatus: AdStatus,
    rejectionReason: z.string().nullable(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    category: AdCategoryDto,
    user: AdOwnerDto,
    images: z.array(AdImageDto),
    isFavorite: z.boolean(),
  })
  .partial();
const PatchResultDto = z
  .object({
    success: z.boolean(),
    updated: z.array(z.string()),
    skipped: z.array(PatchIssueDto),
    errors: z.array(PatchIssueDto),
  })
  .partial();
const postAdsIdupload_Body = z
  .object({ files: z.array(z.instanceof(File)) })
  .partial()
  .passthrough();
const UploadFilesResultDto = z.object({ files: z.array(z.string()) }).partial();
const RegisterRequest = z
  .object({ userLogin: z.string(), userPassword: z.string() })
  .partial();
const AuthSessionResponseDto = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    userId: z.number().int(),
    userLogin: z.string(),
    userName: z.string().nullable(),
    avatarPath: z.string().nullable(),
  })
  .partial();
const LoginRequest = z
  .object({ userLogin: z.string(), userPassword: z.string() })
  .partial();
const RefreshRequest = z.object({ refreshToken: z.string() }).partial();
const AuthRefreshResponseDto = z
  .object({ accessToken: z.string(), refreshToken: z.string() })
  .partial();
const AuthSessionDto = z
  .object({
    id: z.string().uuid(),
    deviceName: z.string().nullable(),
    ipAddress: z.string().nullable(),
    lastActivityAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
    isCurrent: z.boolean(),
  })
  .partial();
const MeRestrictionDto = z
  .object({
    type: z.string(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    reason: z.string().nullable(),
  })
  .partial();
const CategoryDto = z
  .object({
    id: z.number().int(),
    name: z.string(),
    parentId: z.number().int().nullable(),
  })
  .partial();
const UpsertCategoryDto = z
  .object({ name: z.string(), parentId: z.number().int().nullable() })
  .partial();
const CreateConversationRequest = z
  .object({ adId: z.number().int() })
  .partial();
const ConversationCompanionDto = z
  .object({
    id: z.number().int(),
    name: z.string(),
    avatarPath: z.string().nullable(),
    lastActivityAt: z.string().datetime({ offset: true }).nullable(),
  })
  .partial();
const ConversationAdDto = z
  .object({
    id: z.number().int(),
    title: z.string(),
    mainImagePath: z.string().nullable(),
    status: AdStatus,
  })
  .partial();
const MessageType = z.enum([
  "text",
  "image",
  "file",
  "link",
  "audio",
  "video",
  "document",
]);
const ConversationLastMessageDto = z
  .object({
    id: z.number().int().nullable(),
    type: MessageType,
    authorId: z.number().int().nullable(),
    text: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }).nullable(),
  })
  .partial();
const ConversationDto = z
  .object({
    id: z.number().int(),
    companion: ConversationCompanionDto,
    ad: ConversationAdDto,
    lastMessage: ConversationLastMessageDto,
    unreadCount: z.number().int(),
    firstUnreadMessageId: z.number().int().nullable(),
    lastMessageAt: z.string().datetime({ offset: true }).nullable(),
    isClosed: z.boolean(),
    isMuted: z.boolean(),
    isArchived: z.boolean(),
    totalMessagesCount: z.number().int(),
  })
  .partial();
const ConversationActionDto = z
  .object({
    conversationId: z.number().int(),
    message: z.string(),
    conversation: ConversationDto,
  })
  .partial();
const MessageAuthorDto = z
  .object({
    id: z.number().int(),
    userName: z.string().nullable(),
    userLogin: z.string(),
    avatarPath: z.string().nullable(),
  })
  .partial();
const ChatAttachment = z
  .object({ url: z.string(), type: MessageType })
  .partial();
const ConversationMessageDto = z
  .object({
    conversationId: z.number().int(),
    id: z.number().int(),
    type: MessageType,
    authorId: z.number().int(),
    author: MessageAuthorDto,
    createdAt: z.string().datetime({ offset: true }),
    text: z.string().nullable(),
    attachments: z.array(ChatAttachment),
    replyToMessageId: z.number().int().nullable(),
    editedAt: z.string().datetime({ offset: true }).nullable(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    clientTag: z.string().nullable(),
  })
  .partial();
const ConversationMessagesDto = z
  .object({
    conversation: ConversationDto,
    messages: z.array(ConversationMessageDto),
    hasMore: z.boolean(),
    anchorMessageId: z.number().int().nullable(),
    myLastSeenMessageId: z.number().int().nullable(),
    otherLastSeenMessageId: z.number().int().nullable(),
  })
  .partial();
const SendMessageRequest = z
  .object({
    type: MessageType,
    text: z.string().nullable(),
    replyToMessageId: z.number().int().nullable(),
    clientTag: z.string().nullable(),
  })
  .partial();
const ConversationMessageActionDto = z
  .object({ conversationId: z.number().int(), message: ConversationMessageDto })
  .partial();
const postConversationsIdmessagesupload_Body = z
  .object({
    text: z.string(),
    replyToMessageId: z.number().int(),
    files: z.array(z.instanceof(File)),
    clientTag: z.string(),
  })
  .partial()
  .passthrough();
const postConversationsbyAdAdIdmessagesupload_Body = z
  .object({
    text: z.string(),
    replyToMessageId: z.number().int(),
    files: z.array(z.instanceof(File)),
  })
  .partial()
  .passthrough();
const EditMessageRequest = z
  .object({
    text: z.string().nullable(),
    attachments: z.array(ChatAttachment).nullable(),
  })
  .partial();
const postConversationsIdattachments_Body = z
  .object({ files: z.array(z.instanceof(File)), caption: z.string() })
  .partial()
  .passthrough();
const ConversationStateDto = z
  .object({
    id: z.number().int(),
    adId: z.number().int(),
    sellerId: z.number().int(),
    buyerId: z.number().int(),
    createdAt: z.string().datetime({ offset: true }),
    isClosed: z.boolean(),
    lastMessageTimestamp: z.string().datetime({ offset: true }).nullable(),
    lastMessageType: MessageType,
    lastMessageText: z.string().nullable(),
    lastMessageAuthorId: z.number().int().nullable(),
    totalMessagesCount: z.number().int(),
    hasUnread: z.boolean(),
    unreadCount: z.number().int(),
    myLastSeenMessageId: z.number().int().nullable(),
    otherLastSeenMessageId: z.number().int().nullable(),
    isMuted: z.boolean(),
    isArchived: z.boolean(),
  })
  .partial();
const LocationTreeNodeDto: z.ZodType<LocationTreeNodeDto> = z.lazy(() =>
  z
    .object({
      id: z.number().int(),
      name: z.string(),
      type: LocationType,
      children: z.array(LocationTreeNodeDto),
    })
    .partial()
);
// Notification DTO updated: server now provides adTitle, mainImagePath and actorName
const NotificationDto = z
  .object({
    id: z.number().int(),
    type: z.string(),
    isRead: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    reason: z.string().nullable(),
    adId: z.number().int().nullable(),
    adTitle: z.string().nullable(),
    mainImagePath: z.string().nullable(),
    actorName: z.string().nullable(),
  })
  .partial();
const NotificationsResultDto = z
  .object({ items: z.array(NotificationDto) })
  .partial();
const UserAdDto = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string().nullable(),
    price: z.number().nullable(),
    locationId: z.number().int(),
    location: LocationRef,
    listingType: z.string().nullable(),
    isNegotiable: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    viewsCount: z.number().int(),
    favoritesCount: z.number().int(),
    moderationStatus: AdStatus,
    rejectionReason: z.string().nullable(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
    userId: z.number().int(),
    category: AdCategoryDto,
    mainImagePath: z.string().nullable(),
    isFavorite: z.boolean(),
  })
  .partial();
const UserProfileDto = z
  .object({
    id: z.number().int(),
    userLogin: z.string(),
    userName: z.string().nullable(),
    userEmail: z.string().nullable(),
    userPhoneNumber: z.string().nullable(),
    avatarPath: z.string().nullable(),
    roles: z.array(z.string()),
    isOnline: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    lastActivityAt: z.string().datetime({ offset: true }),
    ads: z.array(UserAdDto),
  })
  .partial();
const UserProfileResponseDto = z
  .object({
    userProfile: UserProfileDto,
    currentUserFavorites: z.array(z.number().int()).nullable(),
  })
  .partial();
const FavoriteAdDto = z
  .object({
    id: z.number().int(),
    title: z.string(),
    price: z.number().nullable(),
    isNegotiable: z.boolean(),
    mainImagePath: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    location: LocationRef,
    viewsCount: z.number().int(),
    favoritesCount: z.number().int(),
    status: AdStatus,
    isFavorite: z.boolean(),
    userId: z.number().int(),
  })
  .partial();
const FavoriteMutationDto = z
  .object({
    adId: z.number().int(),
    addedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .partial();
const BlockUserDto = z
  .object({
    id: z.number().int(),
    username: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .partial();
const BlockListItemDto = z
  .object({
    targetUserId: z.number().int(),
    createdAt: z.string().datetime({ offset: true }),
    user: BlockUserDto,
  })
  .partial();
const AvatarUploadDto = z.object({ avatarPath: z.string() }).partial();

export const schemas = {
  AdStatus,
  AdminAdOwnerDto,
  AdCategoryDto,
  LocationType,
  LocationRef,
  AdminAdListItemDto,
  AdminAdListItemDtoPagedResultDto,
  PatchIssueDto,
  ApiError,
  UserDto,
  UserDtoPagedResultDto,
  AdminAuditLogDto,
  AdminAuditLogDtoPagedResultDto,
  RestrictionTypeDto,
  RestrictionActionDto,
  RoleDto,
  RoleActionDto,
  AdStatusActionDto,
  UpdateModerationRequest,
  AdDto,
  ModerationAdDto,
  AdListItemDto,
  AdListItemDtoPagedResultDto,
  postAds_Body,
  AdImageDto,
  CreateAdResultDto,
  AdOwnerDto,
  AdDetailsDto,
  PatchResultDto,
  postAdsIdupload_Body,
  UploadFilesResultDto,
  RegisterRequest,
  AuthSessionResponseDto,
  LoginRequest,
  RefreshRequest,
  AuthRefreshResponseDto,
  AuthSessionDto,
  MeRestrictionDto,
  CategoryDto,
  UpsertCategoryDto,
  CreateConversationRequest,
  ConversationCompanionDto,
  ConversationAdDto,
  MessageType,
  ConversationLastMessageDto,
  ConversationDto,
  ConversationActionDto,
  MessageAuthorDto,
  ChatAttachment,
  ConversationMessageDto,
  ConversationMessagesDto,
  SendMessageRequest,
  ConversationMessageActionDto,
  postConversationsIdmessagesupload_Body,
  postConversationsbyAdAdIdmessagesupload_Body,
  EditMessageRequest,
  postConversationsIdattachments_Body,
  ConversationStateDto,
  LocationTreeNodeDto,
  NotificationDto,
  NotificationsResultDto,
  UserAdDto,
  UserProfileDto,
  UserProfileResponseDto,
  FavoriteAdDto,
  FavoriteMutationDto,
  BlockUserDto,
  BlockListItemDto,
  AvatarUploadDto,
};

const endpoints = makeApi([
  {
    method: "get",
    path: "/admin/ads",
    alias: "getAdminads",
    requestFormat: "json",
    parameters: [
      {
        name: "page",
        type: "Query",
        schema: z.number().int().optional().default(1),
      },
      {
        name: "pageSize",
        type: "Query",
        schema: z.number().int().optional().default(20),
      },
      {
        name: "status",
        type: "Query",
        schema: z.string().optional(),
      },
    ],
    response: AdminAdListItemDtoPagedResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/admin/ads/:id",
    alias: "deleteAdminadsId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdStatusActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/admin/ads/:id/approve",
    alias: "postAdminadsIdapprove",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdStatusActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/admin/ads/:id/hard",
    alias: "deleteAdminadsIdhard",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdStatusActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/admin/ads/:id/reject",
    alias: "postAdminadsIdreject",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.unknown(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdStatusActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/admin/ads/:id/restore",
    alias: "postAdminadsIdrestore",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdStatusActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/admin/ads/:id/send-to-moderation",
    alias: "postAdminadsIdsendToModeration",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdStatusActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/admin/logs",
    alias: "getAdminlogs",
    requestFormat: "json",
    parameters: [
      {
        name: "page",
        type: "Query",
        schema: z.number().int().optional().default(1),
      },
      {
        name: "pageSize",
        type: "Query",
        schema: z.number().int().optional().default(20),
      },
    ],
    response: AdminAuditLogDtoPagedResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/admin/restrictions/types",
    alias: "getAdminrestrictionstypes",
    requestFormat: "json",
    response: z.array(RestrictionTypeDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/admin/users",
    alias: "getAdminusers",
    requestFormat: "json",
    parameters: [
      {
        name: "page",
        type: "Query",
        schema: z.number().int().optional().default(1),
      },
      {
        name: "pageSize",
        type: "Query",
        schema: z.number().int().optional().default(20),
      },
    ],
    response: UserDtoPagedResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/admin/users/:id/restrictions",
    alias: "postAdminusersIdrestrictions",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.unknown(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: RestrictionActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/admin/users/:id/restrictions/:type",
    alias: "deleteAdminusersIdrestrictionsType",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "type",
        type: "Path",
        schema: z.string(),
      },
    ],
    response: RestrictionActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/admin/users/:id/roles",
    alias: "postAdminusersIdroles",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ role: z.string() }).partial(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: RoleActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/admin/users/:id/roles/:role",
    alias: "deleteAdminusersIdrolesRole",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "role",
        type: "Path",
        schema: z.string(),
      },
    ],
    response: RoleActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/ads",
    alias: "getAds",
    requestFormat: "json",
    parameters: [
      {
        name: "Search",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "Location",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "Category",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "PriceFrom",
        type: "Query",
        schema: z.number().optional(),
      },
      {
        name: "PriceTo",
        type: "Query",
        schema: z.number().optional(),
      },
      {
        name: "DateFrom",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "DateTo",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "UserId",
        type: "Query",
        schema: z.number().int().optional(),
      },
      {
        name: "Status",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "Type",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "Page",
        type: "Query",
        schema: z.number().int().optional(),
      },
      {
        name: "PageSize",
        type: "Query",
        schema: z.number().int().optional(),
      },
      {
        name: "Sort",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "Cursor",
        type: "Query",
        schema: z.string().optional(),
      },
    ],
    response: AdListItemDtoPagedResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/ads",
    alias: "postAds",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postAds_Body,
      },
    ],
    response: CreateAdResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/ads/:id",
    alias: "getAdsId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdDetailsDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/ads/:id",
    alias: "deleteAdsId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: CreateAdResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/ads/:id",
    alias: "patchAdsId",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({}).partial().passthrough(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: PatchResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/ads/:id/moderation",
    alias: "patchAdsIdmoderation",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: UpdateModerationRequest,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: AdDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/ads/:id/upload",
    alias: "postAdsIdupload",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postAdsIdupload_Body,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: UploadFilesResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/ads/moderation",
    alias: "getAdsmoderation",
    requestFormat: "json",
    response: z.array(ModerationAdDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/auth/login",
    alias: "postAuthlogin",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: LoginRequest,
      },
    ],
    response: AuthSessionResponseDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/auth/logout",
    alias: "postAuthlogout",
    requestFormat: "json",
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/auth/logout-all",
    alias: "postAuthlogoutAll",
    requestFormat: "json",
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/auth/refresh",
    alias: "postAuthrefresh",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ refreshToken: z.string() }).partial(),
      },
    ],
    response: AuthRefreshResponseDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/auth/register",
    alias: "postAuthregister",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: RegisterRequest,
      },
    ],
    response: AuthSessionResponseDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/auth/sessions",
    alias: "getAuthsessions",
    requestFormat: "json",
    response: z.array(AuthSessionDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/auth/sessions/:id",
    alias: "deleteAuthsessionsId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string().uuid(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/categories",
    alias: "getCategories",
    requestFormat: "json",
    response: z.array(CategoryDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/categories",
    alias: "postCategories",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: UpsertCategoryDto,
      },
    ],
    response: CategoryDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "put",
    path: "/categories/:id",
    alias: "putCategoriesId",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: UpsertCategoryDto,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: CategoryDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/categories/:id",
    alias: "deleteCategoriesId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations",
    alias: "postConversations",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ adId: z.number().int() }).partial(),
      },
    ],
    response: ConversationActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/conversations",
    alias: "getConversations",
    requestFormat: "json",
    response: z.array(ConversationDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/conversations/:id",
    alias: "deleteConversationsId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/conversations/:id",
    alias: "getConversationsId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationStateDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/conversations/:id/archive",
    alias: "patchConversationsIdarchive",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/:id/attachments",
    alias: "postConversationsIdattachments",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postConversationsIdattachments_Body,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/conversations/:id/messages",
    alias: "getConversationsIdmessages",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "count",
        type: "Query",
        schema: z.number().int().optional().default(10),
      },
      {
        name: "before",
        type: "Query",
        schema: z.number().int().optional(),
      },
      {
        name: "since",
        type: "Query",
        schema: z.number().int().optional(),
      },
    ],
    response: ConversationMessagesDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/:id/messages",
    alias: "postConversationsIdmessages",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: SendMessageRequest,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/conversations/:id/messages/:messageId",
    alias: "patchConversationsIdmessagesMessageId",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: EditMessageRequest,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "messageId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/conversations/:id/messages/:messageId",
    alias: "deleteConversationsIdmessagesMessageId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "messageId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/:id/messages/:messageId/attachments",
    alias: "postConversationsIdmessagesMessageIdattachments",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postAdsIdupload_Body,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "messageId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/:id/messages/upload",
    alias: "postConversationsIdmessagesupload",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postConversationsIdmessagesupload_Body,
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/conversations/:id/mute",
    alias: "patchConversationsIdmute",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/conversations/:id/read",
    alias: "patchConversationsIdread",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "lastSeenMessageId",
        type: "Query",
        schema: z.number().int().optional(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/by-ad/:adId/attachments",
    alias: "postConversationsbyAdAdIdattachments",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postConversationsIdattachments_Body,
      },
      {
        name: "adId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/by-ad/:adId/messages",
    alias: "postConversationsbyAdAdIdmessages",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: SendMessageRequest,
      },
      {
        name: "adId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/by-ad/:adId/messages/upload",
    alias: "postConversationsbyAdAdIdmessagesupload",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: postConversationsbyAdAdIdmessagesupload_Body,
      },
      {
        name: "adId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: ConversationMessageActionDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/locations",
    alias: "getLocations",
    requestFormat: "json",
    response: z.array(LocationTreeNodeDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/me/restrictions",
    alias: "getMerestrictions",
    requestFormat: "json",
    response: z.array(MeRestrictionDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/notifications",
    alias: "getNotifications",
    requestFormat: "json",
    response: NotificationsResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/notifications/read",
    alias: "postNotificationsread",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.array(z.number().int()),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/users/:id",
    alias: "getUsersId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: UserProfileResponseDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "patch",
    path: "/users/:id",
    alias: "patchUsersId",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.unknown(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: PatchResultDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/users/:id/ads",
    alias: "getUsersIdads",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.array(UserAdDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/users/:id/favorites",
    alias: "getUsersIdfavorites",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.array(FavoriteAdDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/users/:id/favorites",
    alias: "postUsersIdfavorites",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.number().int(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: FavoriteMutationDto,
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/users/:id/favorites/:adId",
    alias: "deleteUsersIdfavoritesAdId",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
      {
        name: "adId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/users/:id/upload-avatar",
    alias: "postUsersIduploadAvatar",
    requestFormat: "form-data",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z
          .object({ avatar: z.instanceof(File) })
          .partial()
          .passthrough(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.object({ avatarPath: z.string() }).partial(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "post",
    path: "/users/:targetId/blocks",
    alias: "postUsersTargetIdblocks",
    requestFormat: "json",
    parameters: [
      {
        name: "targetId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "delete",
    path: "/users/:targetId/blocks",
    alias: "deleteUsersTargetIdblocks",
    requestFormat: "json",
    parameters: [
      {
        name: "targetId",
        type: "Path",
        schema: z.number().int(),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
  {
    method: "get",
    path: "/users/blocks",
    alias: "getUsersblocks",
    requestFormat: "json",
    response: z.array(BlockListItemDto),
    errors: [
      {
        status: 400,
        description: `Bad Request`,
        schema: ApiError,
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: ApiError,
      },
      {
        status: 403,
        description: `Forbidden`,
        schema: ApiError,
      },
      {
        status: 404,
        description: `Not Found`,
        schema: ApiError,
      },
    ],
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}
